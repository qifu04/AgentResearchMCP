import type { Browser, BrowserContext, Page } from "playwright";
import type { ProviderId, SessionPhase } from "../adapters/provider-contract.js";

export interface SessionCreateOptions {
  provider: ProviderId;
  profileKey?: string | null;
  persistentProfile?: boolean;
  viewport?: {
    width: number;
    height: number;
  } | null;
}

export interface SessionRecord {
  id: string;
  provider: ProviderId;
  phase: SessionPhase;
  createdAt: string;
  updatedAt: string;
  profileKey?: string | null;
  persistentProfile: boolean;
  headed: boolean;
  viewport?: {
    width: number;
    height: number;
  } | null;
  lastError?: string | null;
}

export interface BrowserRuntime {
  browser?: Browser;
  context: BrowserContext;
  page: Page;
  persistent: boolean;
  userDataDir?: string | null;
}

export interface SessionNetworkEntry {
  method: string;
  url: string;
  status?: number | null;
  postData?: string | null;
}

export interface SessionConsoleEntry {
  type: string;
  text: string;
}

export interface SessionPaths {
  rootDir: string;
  domDir: string;
  networkDir: string;
  storageDir: string;
  downloadsDir: string;
  exportsDir: string;
  screenshotsDir: string;
  sessionFile: string;
  stateFile: string;
}

export interface ManagedSession {
  record: SessionRecord;
  paths: SessionPaths;
  runtime?: BrowserRuntime;
  networkEntries: SessionNetworkEntry[];
  consoleEntries: SessionConsoleEntry[];
}
