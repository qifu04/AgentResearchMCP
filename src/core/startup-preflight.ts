import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { ProviderDescriptor } from "../adapters/provider-contract.js";
import { logger } from "../utils/logging.js";
import { SearchService } from "../services/search-service.js";

export type StartupPreflightMode = "full" | "search-only" | "login-only";

export interface StartupPreflightOptions {
  providers?: string[];
  mode?: StartupPreflightMode;
  trace?: boolean;
  collectBrowserMetrics?: boolean;
  maxAttempts?: number;
}

export interface ResolvedStartupPreflightOptions {
  providers?: string[];
  mode: StartupPreflightMode;
  trace: boolean;
  collectBrowserMetrics: boolean;
  maxAttempts: number;
}

export interface ProviderDescriptorSource {
  listDescriptors(): ProviderDescriptor[];
}

export interface BrowserProcessMetrics {
  processCount: number;
  workingSetMb?: number | null;
  privateMb?: number | null;
  cpuSeconds?: number | null;
  error?: string;
}

export interface StartupPreflightStageResult {
  stage: string;
  attempts: number;
  elapsedMs: number;
  browserMetrics?: BrowserProcessMetrics | null;
}

export interface StartupPreflightResult {
  provider: string;
  mode: StartupPreflightMode;
  loginVerified: boolean;
  searchVerified: boolean;
  exportVerified: boolean;
  totalResults?: number | null;
  elapsedMs: number;
  stages: StartupPreflightStageResult[];
}

export function resolveStartupPreflightOptions(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedStartupPreflightOptions {
  const providers = env.STARTUP_PREFLIGHT_PROVIDERS
    ?.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const rawMode = env.STARTUP_PREFLIGHT_MODE?.trim().toLowerCase();

  if (rawMode && rawMode !== "full" && rawMode !== "search-only" && rawMode !== "login-only") {
    throw new Error(
      `Invalid STARTUP_PREFLIGHT_MODE "${env.STARTUP_PREFLIGHT_MODE}". Expected "full", "search-only", or "login-only".`,
    );
  }

  return {
    providers: providers && providers.length > 0 ? providers : undefined,
    mode: (rawMode as StartupPreflightMode | undefined) ?? "full",
    trace: parseBooleanEnv("STARTUP_PREFLIGHT_TRACE", env.STARTUP_PREFLIGHT_TRACE) ?? false,
    collectBrowserMetrics:
      parseBooleanEnv("STARTUP_PREFLIGHT_METRICS", env.STARTUP_PREFLIGHT_METRICS) ?? false,
    maxAttempts: parsePositiveIntegerEnv("STARTUP_PREFLIGHT_MAX_ATTEMPTS", env.STARTUP_PREFLIGHT_MAX_ATTEMPTS) ?? 3,
  };
}

export class StartupPreflightCoordinator {
  private readonly options: ResolvedStartupPreflightOptions;

  constructor(
    private readonly service: SearchService,
    private readonly providers: ProviderDescriptorSource,
    options: StartupPreflightOptions = {},
  ) {
    this.options = {
      providers: options.providers?.map((value) => value.trim().toLowerCase()).filter(Boolean),
      mode: options.mode ?? "full",
      trace: options.trace ?? false,
      collectBrowserMetrics: options.collectBrowserMetrics ?? false,
      maxAttempts: Math.max(1, options.maxAttempts ?? 3),
    };
  }

  async run(): Promise<StartupPreflightResult[]> {
    const descriptors = this.selectDescriptors();
    const startedAt = performance.now();

    logger.info("Startup preflight plan", {
      providers: descriptors.map((descriptor) => descriptor.id),
      mode: this.options.mode,
      trace: this.options.trace,
      collectBrowserMetrics: this.options.collectBrowserMetrics,
      maxAttempts: this.options.maxAttempts,
      parallel: descriptors.length > 1,
    });

    const settled = await Promise.allSettled(
      descriptors.map(async (descriptor) => ({
        descriptor,
        result: await this.runForProvider(descriptor),
      })),
    );

    const failures = settled
      .map((entry, index) => ({ entry, descriptor: descriptors[index] }))
      .filter(
        (
          value,
        ): value is {
          entry: PromiseRejectedResult;
          descriptor: ProviderDescriptor;
        } => value.entry.status === "rejected",
      );

    if (failures.length > 0) {
      throw new Error(
        failures
          .map(({ descriptor, entry }) => {
            const reason = entry.reason instanceof Error ? entry.reason.message : String(entry.reason);
            if (reason.toLowerCase().includes(descriptor.displayName.toLowerCase())) {
              return reason;
            }
            return `Startup preflight failed for ${descriptor.displayName}: ${reason}`;
          })
          .join("; "),
      );
    }

    const results = settled.map((entry) => {
      if (entry.status !== "fulfilled") {
        throw new Error("Startup preflight settled without a result.");
      }
      return entry.value.result;
    });

    logger.info("Startup preflight completed", {
      elapsedMs: roundElapsedMs(startedAt),
      providers: results.map((result) => ({
        provider: result.provider,
        mode: result.mode,
        loginVerified: result.loginVerified,
        searchVerified: result.searchVerified,
        exportVerified: result.exportVerified,
        totalResults: result.totalResults ?? null,
        elapsedMs: result.elapsedMs,
      })),
    });
    return results;
  }

  private selectDescriptors(): ProviderDescriptor[] {
    const descriptors = this.providers.listDescriptors();
    if (!this.options.providers || this.options.providers.length === 0) {
      return descriptors;
    }

    const byId = new Map(descriptors.map((descriptor) => [descriptor.id.toLowerCase(), descriptor]));
    const selected: ProviderDescriptor[] = [];
    const missing: string[] = [];

    for (const providerId of this.options.providers) {
      const descriptor = byId.get(providerId);
      if (!descriptor) {
        missing.push(providerId);
        continue;
      }
      selected.push(descriptor);
    }

    if (missing.length > 0) {
      throw new Error(
        `Unknown STARTUP_PREFLIGHT_PROVIDERS entries: ${missing.join(", ")}. Supported providers: ${descriptors
          .map((descriptor) => descriptor.id)
          .join(", ")}`,
      );
    }

    return selected;
  }

  private async runForProvider(descriptor: ProviderDescriptor): Promise<StartupPreflightResult> {
    const startedAt = performance.now();
    const stages: StartupPreflightStageResult[] = [];

    logger.info("Startup preflight starting", {
      provider: descriptor.id,
      persistentProfile: descriptor.supportsManualLoginWait,
      mode: this.options.mode,
    });

    const session = await this.service.createSession({
      provider: descriptor.id,
      persistentProfile: descriptor.supportsManualLoginWait,
    });

    try {
      await this.runStage(
        descriptor,
        session.id,
        stages,
        "open_advanced_search",
        async () => this.service.openAdvancedSearch(session.id),
      );

      let loginState = await this.runStage(
        descriptor,
        session.id,
        stages,
        "get_login_state",
        async () => this.service.getLoginState(session.id),
      );

      if (!loginState.canExport) {
        if (!descriptor.supportsManualLoginWait) {
          throw new Error(loginState.blockingReason ?? `${descriptor.displayName} is not export-ready.`);
        }

        logger.warn("Startup preflight waiting for user login", {
          provider: descriptor.id,
          blockingReason: loginState.blockingReason ?? null,
        });

        loginState = await this.runStage(
          descriptor,
          session.id,
          stages,
          "wait_for_login",
          async () => this.service.waitForLogin(session.id, { capability: "export" }),
        );
        await this.runStage(
          descriptor,
          session.id,
          stages,
          "reopen_advanced_search_after_login",
          async () => this.service.openAdvancedSearch(session.id),
        );
      }

      let searchVerified = false;
      let exportVerified = false;
      let totalResults: number | null = null;

      if (this.options.mode !== "login-only") {
        const probe = await this.runStage(
          descriptor,
          session.id,
          stages,
          "startup_probe",
          async () =>
            this.service.runStartupProbe(session.id, {
              verifyExport: this.options.mode === "full",
            }),
          async () => {
            await this.service.openAdvancedSearch(session.id);
          },
        );

        searchVerified = true;
        exportVerified = probe.exportVerified;
        totalResults = probe.totalResults ?? null;
      }

      const result: StartupPreflightResult = {
        provider: descriptor.id,
        mode: this.options.mode,
        loginVerified: loginState.canExport,
        searchVerified,
        exportVerified,
        totalResults,
        elapsedMs: roundElapsedMs(startedAt),
        stages,
      };

      logger.info("Startup preflight passed", result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Startup preflight failed", {
        provider: descriptor.id,
        error: message,
      });
      throw new Error(`Startup preflight failed for ${descriptor.displayName}: ${message}`);
    } finally {
      await this.service.closeSession(session.id).catch(() => undefined);
    }
  }

  private async runStage<T>(
    descriptor: ProviderDescriptor,
    sessionId: string,
    stages: StartupPreflightStageResult[],
    stage: string,
    task: () => Promise<T>,
    recover?: () => Promise<void>,
  ): Promise<T> {
    const startedAt = performance.now();
    let attempts = 0;

    while (attempts < this.options.maxAttempts) {
      attempts += 1;
      try {
        const value = await task();
        const result = await this.createStageResult(sessionId, stage, attempts, startedAt);
        stages.push(result);
        if (this.options.trace) {
          logger.info("Startup preflight stage passed", {
            provider: descriptor.id,
            ...result,
          });
        }
        return value;
      } catch (error) {
        if (!isRetryablePreflightError(error) || attempts >= this.options.maxAttempts) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Startup preflight transient failure, retrying", {
          provider: descriptor.id,
          stage,
          attempt: attempts,
          nextAttempt: attempts + 1,
          elapsedMs: roundElapsedMs(startedAt),
          error: message,
        });

        await recover?.().catch(() => undefined);
      }
    }

    throw new Error(`Startup preflight exhausted retries for ${descriptor.displayName} during ${stage}.`);
  }

  private async createStageResult(
    sessionId: string,
    stage: string,
    attempts: number,
    startedAt: number,
  ): Promise<StartupPreflightStageResult> {
    return {
      stage,
      attempts,
      elapsedMs: roundElapsedMs(startedAt),
      browserMetrics: await this.captureBrowserMetrics(sessionId),
    };
  }

  private async captureBrowserMetrics(sessionId: string): Promise<BrowserProcessMetrics | null | undefined> {
    if (!this.options.collectBrowserMetrics || process.platform !== "win32") {
      return undefined;
    }

    const session = await this.service.sessionManager.getSession(sessionId);
    const userDataDir = session?.runtime?.userDataDir;
    if (!userDataDir) {
      return null;
    }

    try {
      const script = [
        "$ProgressPreference = 'SilentlyContinue'",
        `$target = '${userDataDir.replace(/'/g, "''")}'`,
        "try {",
        `  $items = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($target) }`,
        "  $count = @($items).Count",
        "  if ($count -eq 0) { '{\"processCount\":0}'; exit 0 }",
        "  $ws = [math]::Round((($items | Measure-Object WorkingSetSize -Sum).Sum / 1MB), 1)",
        "  $pm = [math]::Round((($items | Measure-Object PrivatePageCount -Sum).Sum / 1MB), 1)",
        "  [pscustomobject]@{ processCount = $count; workingSetMb = $ws; privateMb = $pm } | ConvertTo-Json -Compress",
        "} catch { [pscustomobject]@{ processCount = -1; error = $_.Exception.Message } | ConvertTo-Json -Compress }",
      ].join("\n");
      const encodedScript = Buffer.from(script, "utf16le").toString("base64");
      const raw = execFileSync("powershell", ["-NoProfile", "-EncodedCommand", encodedScript], {
        encoding: "utf8",
        timeout: 10_000,
      }).trim();
      return raw ? (JSON.parse(raw) as BrowserProcessMetrics) : null;
    } catch (error) {
      return {
        processCount: -1,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

function parseBooleanEnv(name: string, value?: string): boolean | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid ${name} "${value}". Expected a boolean value such as 0/1 or true/false.`);
}

function parsePositiveIntegerEnv(name: string, value?: string): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const numeric = Number.parseInt(value, 10);
  if (!Number.isInteger(numeric) || numeric < 1) {
    throw new Error(`Invalid ${name} "${value}". Expected a positive integer.`);
  }
  return numeric;
}

function roundElapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

function isRetryablePreflightError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return [
    "timeout",
    "timed out",
    "navigation",
    "net::err",
    "err_",
    "execution context was destroyed",
    "frame was detached",
    "target page, context or browser has been closed",
    "unable to find visible element",
    "failed to set expected input value",
    "waiting for selector",
    "waiting for locator",
  ].some((pattern) => message.includes(pattern));
}
