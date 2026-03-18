import type { Page } from "playwright";

export type ProviderId = "wos" | "pubmed" | "ieee" | "scopus" | (string & {});

export type SessionPhase =
  | "created"
  | "starting"
  | "ready"
  | "awaiting_user_login"
  | "awaiting_manual_intervention"
  | "search_ready"
  | "searching"
  | "exporting"
  | "completed"
  | "closed"
  | "error";

export type LoginStateKind = "anonymous" | "institutional" | "personal" | "unknown";

export type FilterType = "checkbox" | "radio" | "range" | "date-range" | "text" | "unknown";

export type NativeExportFormat = "ris" | "nbib" | "csv" | "bibtex" | "unknown";

export type ExportScope = "all";

export interface ProviderDescriptor {
  id: ProviderId;
  displayName: string;
  entryUrl: string;
  supportsManualLoginWait: boolean;
  capabilities: {
    rawQuery: boolean;
    builderUi: boolean;
    filters: boolean;
    inlineAbstracts: boolean;
    selection: boolean;
    export: boolean;
  };
}

export interface ProviderContext {
  provider: ProviderId;
  sessionId: string;
  phase: SessionPhase;
  artifactsDir: string;
  downloadsDir: string;
  page: Page;
  raw?: unknown;
}

export interface LoginState {
  kind: LoginStateKind;
  authenticated: boolean;
  canSearch: boolean;
  canExport: boolean;
  institutionAccess?: string | null;
  requiresInteractiveLogin?: boolean;
  blockingReason?: string | null;
  detectedBy: string[];
  raw?: unknown;
}

export interface QueryFieldTag {
  code: string;
  label: string;
  description?: string | null;
}

export interface QueryLanguageProfile {
  provider: ProviderId;
  supportsRawEditor: boolean;
  supportsBuilderUi: boolean;
  supportsUrlQueryRecovery: boolean;
  rawEntryLabel?: string | null;
  fieldTags: QueryFieldTag[];
  booleanOperators: string[];
  proximityOperators?: string[];
  wildcards?: string[];
  examples: string[];
  constraints: string[];
  recommendedPatterns: string[];
  antiPatterns: string[];
  raw?: unknown;
}

export interface SearchSummary {
  provider: ProviderId;
  query: string;
  totalResultsText?: string | null;
  totalResults?: number | null;
  currentPage?: number | null;
  totalPages?: number | null;
  pageSize?: number | null;
  queryId?: string | null;
  sort?: string | null;
  raw?: unknown;
}

export interface ResultItem {
  provider: ProviderId;
  indexOnPage: number;
  title: string;
  href?: string | null;
  authorsText?: string | null;
  sourceText?: string | null;
  yearText?: string | null;
  abstractPreview?: string | null;
  labels?: string[];
  selectable?: boolean;
  raw?: unknown;
}

export interface FilterOption {
  value: string;
  label: string;
  countText?: string | null;
}

export interface FilterGroup {
  key: string;
  label: string;
  type: FilterType;
  options?: FilterOption[];
  raw?: unknown;
}

export interface FilterApplyRequest {
  key: string;
  values?: string[];
  from?: string | number | null;
  to?: string | number | null;
  raw?: unknown;
}

export interface ExportCapability {
  requiresInteractiveLogin?: boolean;
  maxBatch?: number | null;
  blockingReason?: string | null;
  raw?: unknown;
}

export interface ExportRequest {
  scope: ExportScope;
  start?: number;
  end?: number;
  includeAbstracts?: boolean;
  outputDir?: string;
  raw?: unknown;
}

export interface ExportResult {
  provider: ProviderId;
  format: NativeExportFormat | "ris";
  path?: string;
  fileName?: string | null;
  convertedToRis?: boolean;
  chunks?: string[];
  raw?: unknown;
}

export interface StartupProbeResult {
  provider: ProviderId;
  query: string;
  totalResults?: number | null;
  exportVerified: boolean;
  format?: NativeExportFormat | "ris" | null;
  fileName?: string | null;
  raw?: unknown;
}

export interface SearchObservation {
  loginState: LoginState;
  queryProfile: QueryLanguageProfile;
  summary: SearchSummary;
  results: ResultItem[];
  filters: FilterGroup[];
  exportCapability: ExportCapability;
}

export interface ToolEnvelope<T> {
  ok: boolean;
  provider: ProviderId;
  sessionId: string;
  phase: SessionPhase;
  timestamp: string;
  warnings?: string[];
  nextActions?: string[];
  data: T;
  raw?: unknown;
}

export interface SearchProviderAdapter {
  readonly descriptor: ProviderDescriptor;

  openAdvancedSearch(context: ProviderContext): Promise<void>;
  clearInterferingUi(context: ProviderContext): Promise<void>;
  detectLoginState(context: ProviderContext): Promise<LoginState>;
  getQueryLanguageProfile(context: ProviderContext): Promise<QueryLanguageProfile>;
  readCurrentQuery(context: ProviderContext): Promise<string | null>;
  setCurrentQuery(context: ProviderContext, query: string): Promise<void>;
  submitSearch(context: ProviderContext): Promise<SearchSummary>;
  readSearchSummary(context: ProviderContext): Promise<SearchSummary>;
  readResultItems(context: ProviderContext, limit: number): Promise<ResultItem[]>;
  readResultAbstracts(context: ProviderContext, limit: number): Promise<ResultItem[]>;
  listFilters(context: ProviderContext): Promise<FilterGroup[]>;
  applyFilters(context: ProviderContext, input: FilterApplyRequest[]): Promise<SearchSummary>;
  selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void>;
  clearSelection(context: ProviderContext): Promise<void>;
  detectExportCapability(context: ProviderContext): Promise<ExportCapability>;
  exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult>;
  runStartupProbe(context: ProviderContext): Promise<StartupProbeResult>;
}
