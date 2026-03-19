import type { ProviderId, QueryLanguageProfile } from "../adapters/provider-contract.js";

export interface ProviderSummary {
  id: ProviderId;
  displayName: string;
}

export interface CreateSessionInput {
  provider: ProviderId;
  profileKey?: string;
  persistentProfile?: boolean;
}

export interface CreateSessionOutput {
  sessionId: string;
  provider: ProviderId;
  displayName: string;
  queryProfile: QueryLanguageProfile;
}

export interface SessionInput {
  sessionId: string;
}

export interface RunSearchInput extends SessionInput {
  query?: string;
  sampleSize?: number;
}

export interface ExportResultsInput extends SessionInput {
  outputDir?: string;
}
