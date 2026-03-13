import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProviderId, SessionPhase } from "../adapters/provider-contract.js";
import { PlaywrightFactory } from "../browser/playwright-factory.js";
import { PersistentProfileStore } from "../browser/persistent-profile-store.js";
import { ArtifactManager } from "./artifact-manager.js";
import type { ManagedSession, SessionCreateOptions, SessionRecord, SessionConsoleEntry, SessionNetworkEntry } from "../types/session.js";
import { ensureDir, readJsonFile, writeJsonFile } from "../utils/fs.js";
import { nowIso } from "../utils/time.js";

export interface SessionManagerOptions {
  workspaceRoot: string;
  artifactManager?: ArtifactManager;
  playwrightFactory?: PlaywrightFactory;
  profileStore?: PersistentProfileStore;
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly stateRootDir: string;
  private readonly sessionsRootDir: string;
  private readonly authRootDir: string;
  private readonly artifactManager: ArtifactManager;
  private readonly playwrightFactory: PlaywrightFactory;
  private readonly profileStore: PersistentProfileStore;

  constructor(options: SessionManagerOptions) {
    this.stateRootDir = path.join(options.workspaceRoot, ".agent-research-mcp");
    this.sessionsRootDir = path.join(this.stateRootDir, "sessions");
    this.authRootDir = path.join(this.stateRootDir, "auth");
    this.artifactManager = options.artifactManager ?? new ArtifactManager();
    this.playwrightFactory = options.playwrightFactory ?? new PlaywrightFactory();
    this.profileStore = options.profileStore ?? new PersistentProfileStore(this.authRootDir);
  }

  async initialize(): Promise<void> {
    await Promise.all([ensureDir(this.stateRootDir), ensureDir(this.sessionsRootDir), ensureDir(this.authRootDir)]);
  }

  async createSession(input: SessionCreateOptions): Promise<ManagedSession> {
    await this.initialize();

    const id = randomUUID();
    const createdAt = nowIso();
    const record: SessionRecord = {
      id,
      provider: input.provider,
      phase: "created",
      createdAt,
      updatedAt: createdAt,
      profileKey: input.profileKey ?? null,
      persistentProfile: input.persistentProfile ?? false,
      headed: true,
      viewport: input.viewport ?? { width: 1440, height: 1100 },
      lastError: null,
    };

    const paths = await this.artifactManager.ensureSessionPaths(path.join(this.sessionsRootDir, id));
    const session: ManagedSession = {
      record,
      paths,
      networkEntries: [],
      consoleEntries: [],
    };

    this.sessions.set(id, session);
    await this.persistSession(session);
    return session;
  }

  async listSessions(): Promise<SessionRecord[]> {
    await this.initialize();
    const known = Array.from(this.sessions.values()).map((session) => session.record);
    return known.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getSession(sessionId: string): Promise<ManagedSession | null> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const sessionFile = path.join(this.sessionsRootDir, sessionId, "session.json");
    const record = await readJsonFile<SessionRecord>(sessionFile);
    if (!record) {
      return null;
    }

    const paths = await this.artifactManager.ensureSessionPaths(path.join(this.sessionsRootDir, sessionId));
    const restored: ManagedSession = {
      record,
      paths,
      networkEntries: [],
      consoleEntries: [],
    };
    this.sessions.set(sessionId, restored);
    return restored;
  }

  async requireSession(sessionId: string): Promise<ManagedSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return session;
  }

  async ensureRuntime(sessionId: string): Promise<ManagedSession> {
    const session = await this.requireSession(sessionId);
    if (session.runtime) {
      return session;
    }

    await this.setPhase(sessionId, "starting");

    let userDataDir: string | null = null;
    if (session.record.persistentProfile) {
      // Acquire exclusive lock before launching browser with this profile
      this.profileStore.acquireProfileLock(session.record.provider, session.record.profileKey, sessionId);
      userDataDir = await this.profileStore.ensureProfileDir(session.record.provider, session.record.profileKey);
    }

    session.runtime = await this.playwrightFactory.createRuntime({
      viewport: session.record.viewport ?? undefined,
      downloadsPath: session.paths.downloadsDir,
      userDataDir,
    });
    this.attachRuntimeObservers(session);
    await this.setPhase(sessionId, "ready");
    return session;
  }

  async setPhase(sessionId: string, phase: SessionPhase, lastError?: string | null): Promise<ManagedSession> {
    const session = await this.requireSession(sessionId);
    session.record.phase = phase;
    session.record.updatedAt = nowIso();
    if (lastError !== undefined) {
      session.record.lastError = lastError;
    }
    await this.persistSession(session);
    return session;
  }

  async markError(sessionId: string, error: unknown): Promise<ManagedSession> {
    const message = error instanceof Error ? error.message : String(error);
    return this.setPhase(sessionId, "error", message);
  }

  async closeSession(sessionId: string): Promise<ManagedSession> {
    const session = await this.requireSession(sessionId);
    await this.playwrightFactory.closeRuntime(session.runtime);
    session.runtime = undefined;

    // Release profile lock if this session held one
    if (session.record.persistentProfile) {
      this.profileStore.releaseProfileLock(session.record.provider, session.record.profileKey, sessionId);
    }

    await this.setPhase(sessionId, "closed");
    return session;
  }

  buildProviderContext(session: ManagedSession): {
    provider: ProviderId;
    sessionId: string;
    phase: SessionPhase;
    artifactsDir: string;
    downloadsDir: string;
    page: NonNullable<ManagedSession["runtime"]>["page"];
    raw: {
      userDataDir: string | null | undefined;
    };
  } {
    if (!session.runtime) {
      throw new Error(`Session ${session.record.id} does not have an active browser runtime.`);
    }

    return {
      provider: session.record.provider,
      sessionId: session.record.id,
      phase: session.record.phase,
      artifactsDir: session.paths.rootDir,
      downloadsDir: session.paths.downloadsDir,
      page: session.runtime.page,
      raw: {
        userDataDir: session.runtime.userDataDir,
      },
    };
  }

  async persistState(sessionId: string, value: unknown): Promise<void> {
    const session = await this.requireSession(sessionId);
    await writeJsonFile(session.paths.stateFile, value);
  }

  getArtifactManager(): ArtifactManager {
    return this.artifactManager;
  }

  private async persistSession(session: ManagedSession): Promise<void> {
    await writeJsonFile(session.paths.sessionFile, session.record);
  }

  private attachRuntimeObservers(session: ManagedSession): void {
    if (!session.runtime) {
      return;
    }

    const page = session.runtime.page;
    page.on("console", (message) => {
      const entry: SessionConsoleEntry = {
        type: message.type(),
        text: message.text(),
      };
      session.consoleEntries.push(entry);
    });

    page.on("requestfinished", async (request) => {
      const response = await request.response().catch(() => null);
      const entry: SessionNetworkEntry = {
        method: request.method(),
        url: request.url(),
        status: response?.status() ?? null,
        postData: request.postData(),
      };
      session.networkEntries.push(entry);
    });
  }
}
