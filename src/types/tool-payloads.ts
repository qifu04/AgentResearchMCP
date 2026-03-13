import type { ExportRequest, ProviderId } from "../adapters/provider-contract.js";

export interface CreateSessionInput {
  provider: ProviderId;
  profileKey?: string;
  persistentProfile?: boolean;
}

export interface SessionInput {
  sessionId: string;
}

export interface SetQueryInput extends SessionInput {
  query: string;
}

export interface RunSearchInput extends SessionInput {
  query?: string;
  sampleSize?: number;
}

export interface ResultSampleInput extends SessionInput {
  limit?: number;
}

export interface WaitForLoginInput extends SessionInput {
  capability?: "search" | "export" | "personal";
  timeoutMs?: number;
  pollMs?: number;
}

export interface ApplyFiltersInput extends SessionInput {
  filters: Array<{
    key: string;
    values?: string[];
    from?: string | number | null;
    to?: string | number | null;
  }>;
}

export interface SelectResultsInput extends SessionInput {
  indices: number[];
}

export interface ExportResultsInput extends SessionInput {
  request: ExportRequest;
}

export interface ConvertExportToRisInput extends SessionInput {
  filePath: string;
  format?: string;
}

export interface CaptureArtifactsInput extends SessionInput {
  label?: string;
}
