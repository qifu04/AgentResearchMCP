import { randomUUID } from "node:crypto";
import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  FilterApplyRequest,
  FilterGroup,
  LoginState,
  ProviderId,
  QueryLanguageProfile,
  ResultItem,
  SearchObservation,
  SearchProviderAdapter,
  SearchSummary,
  StartupProbeResult,
} from "../adapters/provider-contract.js";
import { waitForDocumentReady } from "../browser/page-helpers.js";
import { bringWindowOnScreen, notifyUser, sendWindowOffScreen } from "../browser/window-position.js";
import { ExportManager } from "../core/export-manager.js";
import { isManualInterventionRequiredError } from "../core/manual-intervention.js";
import { LoginOrchestrator, type WaitForLoginOptions } from "../core/login-orchestrator.js";
import { SessionLock } from "../core/session-lock.js";
import { SessionManager } from "../core/session-manager.js";
import type { SessionCreateOptions, SessionRecord } from "../types/session.js";
import { ensureDir, removePath } from "../utils/fs.js";

export interface AdapterResolver {
  get(providerId: ProviderId): SearchProviderAdapter;
}

export interface SearchServiceOptions {
  workspaceRoot: string;
  sessionManager?: SessionManager;
  sessionLock?: SessionLock;
  exportManager?: ExportManager;
  loginOrchestrator?: LoginOrchestrator;
}

export class SearchService {
  readonly sessionManager: SessionManager;
  private readonly sessionLock: SessionLock;
  private readonly exportManager: ExportManager;
  private readonly loginOrchestrator: LoginOrchestrator;

  constructor(
    private readonly adapters: AdapterResolver,
    options: SearchServiceOptions,
  ) {
    this.sessionManager =
      options.sessionManager ??
      new SessionManager({
        workspaceRoot: options.workspaceRoot,
      });
    this.sessionLock = options.sessionLock ?? new SessionLock();
    this.exportManager = options.exportManager ?? new ExportManager(this.sessionManager);
    this.loginOrchestrator = options.loginOrchestrator ?? new LoginOrchestrator(this.sessionManager);
  }

  async createSession(input: SessionCreateOptions): Promise<SessionRecord> {
    const session = await this.sessionManager.createSession(this.normalizeSessionCreateOptions(input));
    return session.record;
  }

  async listSessions(): Promise<SessionRecord[]> {
    return this.sessionManager.listSessions();
  }

  async getSession(sessionId: string): Promise<SessionRecord> {
    return (await this.sessionManager.requireSession(sessionId)).record;
  }

  async closeSession(sessionId: string): Promise<SessionRecord> {
    const session = await this.withSessionLock(sessionId, async () => this.sessionManager.closeSession(sessionId));
    return session.record;
  }

  async openAdvancedSearch(sessionId: string): Promise<SessionRecord> {
    const session = await this.withAdapter(sessionId, async (adapter, context) => {
      await adapter.openAdvancedSearch(context);
      await adapter.clearInterferingUi(context);
      await this.sessionManager.setPhase(sessionId, "search_ready");
      return this.sessionManager.requireSession(sessionId);
    });
    return session.record;
  }

  async getLoginState(sessionId: string): Promise<LoginState> {
    return this.withAdapter(sessionId, async (adapter, context) => adapter.detectLoginState(context));
  }

  async waitForLogin(sessionId: string, options: WaitForLoginOptions): Promise<LoginState> {
    const session = await this.sessionManager.ensureRuntime(sessionId);
    const adapter = this.adapters.get(session.record.provider);
    await bringWindowOnScreen(session.runtime!.page);
    notifyUser("需要登录", `请在浏览器中完成 ${session.record.provider} 登录`);
    const result = await this.loginOrchestrator.waitForLoginTransition(sessionId, adapter, options);
    await sendWindowOffScreen(session.runtime!.page);
    return result;
  }

  async getQueryLanguageProfile(sessionId: string): Promise<QueryLanguageProfile> {
    return this.withAdapter(sessionId, async (adapter, context) => adapter.getQueryLanguageProfile(context));
  }

  async readCurrentQuery(sessionId: string): Promise<string | null> {
    return this.withAdapter(sessionId, async (adapter, context) => adapter.readCurrentQuery(context));
  }

  async setQuery(sessionId: string, query: string): Promise<string | null> {
    return this.withAdapter(sessionId, async (adapter, context) => {
      await adapter.setCurrentQuery(context, query);
      return adapter.readCurrentQuery(context);
    });
  }

  async runSearch(sessionId: string, input: { query?: string; sampleSize?: number } = {}): Promise<SearchObservation> {
    return this.withAdapter(sessionId, async (adapter, context) => {
      if (input.query) {
        await adapter.setCurrentQuery(context, input.query);
      }
      await this.sessionManager.setPhase(sessionId, "searching");
      await adapter.submitSearch(context);
      await this.sessionManager.setPhase(sessionId, "search_ready");
      return this.collectObservation(sessionId, adapter, input.sampleSize ?? 5);
    });
  }

  async readSearchSummary(sessionId: string): Promise<SearchSummary> {
    return this.withAdapter(sessionId, async (adapter, context) => adapter.readSearchSummary(context));
  }

  async readResultSample(sessionId: string, limit = 5): Promise<ResultItem[]> {
    return this.withAdapter(sessionId, async (adapter, context) => {
      const items = await adapter.readResultItems(context, limit);
      const withAbstracts = await adapter.readResultAbstracts(context, limit);
      return mergeResultItems(items, withAbstracts);
    });
  }

  async listFilters(sessionId: string): Promise<FilterGroup[]> {
    return this.withAdapter(sessionId, async (adapter, context) => adapter.listFilters(context));
  }

  async applyFilters(sessionId: string, filters: FilterApplyRequest[], sampleSize = 5): Promise<SearchObservation> {
    return this.withAdapter(sessionId, async (adapter, context) => {
      await this.sessionManager.setPhase(sessionId, "searching");
      await adapter.applyFilters(context, filters);
      await this.sessionManager.setPhase(sessionId, "search_ready");
      return this.collectObservation(sessionId, adapter, sampleSize);
    });
  }

  async selectResults(sessionId: string, indices: number[]): Promise<void> {
    await this.withAdapter(sessionId, async (adapter, context) => {
      await adapter.selectResultsByIndex(context, indices);
    });
  }

  async clearSelection(sessionId: string): Promise<void> {
    await this.withAdapter(sessionId, async (adapter, context) => {
      await adapter.clearSelection(context);
    });
  }

  async getExportCapability(sessionId: string): Promise<ExportCapability> {
    return this.withAdapter(sessionId, async (adapter, context) => adapter.detectExportCapability(context));
  }

  async exportResults(
    sessionId: string,
    request: { request: ExportRequest },
  ): Promise<ExportResult> {
    return this.withAdapter(sessionId, async (adapter) => {
      let result = await this.exportManager.exportWithAdapter(sessionId, adapter, request.request);

      if (request.request.outputDir) {
        result = await this.exportManager.copyToOutputDir(result, request.request.outputDir);
      }

      return result;
    });
  }

  async runStartupProbe(sessionId: string): Promise<StartupProbeResult> {
    return this.withAdapter(sessionId, async (adapter, context) => {
      await this.sessionManager.setPhase(sessionId, "searching");
      const result = await adapter.runStartupProbe(context);
      const session = await this.sessionManager.requireSession(sessionId);
      await removePath(session.paths.downloadsDir);
      await ensureDir(session.paths.downloadsDir);
      await this.sessionManager.setPhase(sessionId, "completed");
      return result;
    });
  }

  async convertExportToRis(sessionId: string, filePath: string, format?: string): Promise<string> {
    await this.sessionManager.requireSession(sessionId);
    return this.exportManager.convertExportToRis(filePath, format);
  }

  async captureSessionArtifacts(
    sessionId: string,
    label = `capture-${Date.now()}`,
  ): Promise<{
    domPath: string;
    screenshotPath: string;
    storagePath: string;
    networkPath: string;
  }> {
    return this.withSessionLock(sessionId, async () => {
      const session = await this.sessionManager.ensureRuntime(sessionId);
      const artifactManager = this.sessionManager.getArtifactManager();
      const page = session.runtime?.page;
      if (!page) {
        throw new Error(`Session ${sessionId} has no active page.`);
      }
      await waitForDocumentReady(page);
      const domPath = await artifactManager.captureDomSnapshot(page, session.paths, label);
      const screenshotPath = await artifactManager.captureScreenshot(page, session.paths, label);
      const storagePath = await artifactManager.captureStorageState(page, session.paths, label);
      const networkPath = await artifactManager.captureNetworkLog(session.paths, label, session.networkEntries);
      return {
        domPath,
        screenshotPath,
        storagePath,
        networkPath,
      };
    });
  }

  private async collectObservation(
    sessionId: string,
    adapter: SearchProviderAdapter,
    sampleSize: number,
  ): Promise<SearchObservation> {
    const session = await this.sessionManager.requireSession(sessionId);
    const context = this.sessionManager.buildProviderContext(session);
    await waitForDocumentReady(context.page);

    const [loginState, queryProfile, summary, filters, exportCapability] = await Promise.all([
      adapter.detectLoginState(context),
      adapter.getQueryLanguageProfile(context),
      adapter.readSearchSummary(context),
      adapter.listFilters(context),
      adapter.detectExportCapability(context),
    ]);
    const items = await adapter.readResultItems(context, sampleSize);
    const withAbstracts = await adapter.readResultAbstracts(context, sampleSize);

    return {
      loginState,
      queryProfile,
      summary,
      results: mergeResultItems(items, withAbstracts),
      filters,
      exportCapability,
    };
  }

  private normalizeSessionCreateOptions(input: SessionCreateOptions): SessionCreateOptions {
    if (input.persistentProfile !== undefined) {
      return input;
    }

    const descriptor = this.adapters.get(input.provider).descriptor;
    return {
      ...input,
      persistentProfile: descriptor.supportsManualLoginWait,
    };
  }

  private async withAdapter<T>(
    sessionId: string,
    task: (adapter: SearchProviderAdapter, context: ReturnType<SessionManager["buildProviderContext"]>) => Promise<T>,
  ): Promise<T> {
    return this.withSessionLock(sessionId, async () => {
      const session = await this.sessionManager.ensureRuntime(sessionId);
      const wasAwaitingIntervention = session.record.phase === "awaiting_manual_intervention";
      const adapter = this.adapters.get(session.record.provider);
      const context = this.sessionManager.buildProviderContext(session);
      try {
        await waitForDocumentReady(context.page);
        const result = await task(adapter, context);
        await waitForDocumentReady(context.page);
        if (wasAwaitingIntervention) {
          await sendWindowOffScreen(context.page);
        }
        return result;
      } catch (error) {
        if (isManualInterventionRequiredError(error)) {
          await bringWindowOnScreen(context.page);
          notifyUser("需要人工操作", error.message);
          await this.sessionManager.setPhase(sessionId, "awaiting_manual_intervention", error.message);
          throw error;
        }
        await this.sessionManager.markError(sessionId, error);
        throw error;
      }
    });
  }

  private async withSessionLock<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    return this.sessionLock.runExclusive(sessionId, randomUUID(), task);
  }
}

function mergeResultItems(items: ResultItem[], abstractItems: ResultItem[]): ResultItem[] {
  const merged = new Map<number, ResultItem>();

  for (const item of items) {
    merged.set(item.indexOnPage, item);
  }
  for (const item of abstractItems) {
    const previous = merged.get(item.indexOnPage);
    merged.set(item.indexOnPage, {
      ...previous,
      ...item,
      labels: item.labels ?? previous?.labels,
      raw: {
        ...objectOrUndefined(previous?.raw),
        ...objectOrUndefined(item.raw),
      },
    });
  }

  return Array.from(merged.values()).sort((left, right) => left.indexOnPage - right.indexOnPage);
}

function objectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
