import type {
  ExportCapability,
  ExportRequest,
  ExportResult,
  FilterApplyRequest,
  FilterGroup,
  LoginState,
  ProviderContext,
  ProviderDescriptor,
  QueryLanguageProfile,
  ResultItem,
  SearchProviderAdapter,
  SearchSummary,
} from "../../src/adapters/provider-contract";

export const providerDescriptor: ProviderDescriptor = {
  id: "replace-me",
  displayName: "Replace Me",
  entryUrl: "https://example.com/advanced-search",
  supportsManualLoginWait: true,
  capabilities: {
    rawQuery: true,
    builderUi: false,
    filters: true,
    inlineAbstracts: true,
    selection: true,
    export: true,
  },
};

export class TemplateProviderAdapter implements SearchProviderAdapter {
  readonly descriptor = providerDescriptor;

  async openAdvancedSearch(context: ProviderContext): Promise<void> {
    void context;
    throw new Error("TODO: open the provider advanced-search entry page.");
  }

  async clearInterferingUi(context: ProviderContext): Promise<void> {
    void context;
    throw new Error("TODO: dismiss cookie banners, guides, and other blocking UI.");
  }

  async detectLoginState(context: ProviderContext): Promise<LoginState> {
    void context;
    throw new Error("TODO: return anonymous/institutional/personal state using provider-specific signals.");
  }

  async getQueryLanguageProfile(context: ProviderContext): Promise<QueryLanguageProfile> {
    void context;
    throw new Error("TODO: return field tags, operators, constraints, and examples.");
  }

  async readCurrentQuery(context: ProviderContext): Promise<string | null> {
    void context;
    throw new Error("TODO: read the current raw query from the provider UI.");
  }

  async setCurrentQuery(context: ProviderContext, query: string): Promise<void> {
    void context;
    void query;
    throw new Error("TODO: set the raw query in a deterministic way.");
  }

  async submitSearch(context: ProviderContext): Promise<SearchSummary> {
    void context;
    throw new Error("TODO: submit search and return normalized summary.");
  }

  async readSearchSummary(context: ProviderContext): Promise<SearchSummary> {
    void context;
    throw new Error("TODO: read total results, page info, and provider query id if present.");
  }

  async readResultItems(context: ProviderContext, limit: number): Promise<ResultItem[]> {
    void context;
    void limit;
    throw new Error("TODO: read normalized result rows from the first page.");
  }

  async readResultAbstracts(context: ProviderContext, limit: number): Promise<ResultItem[]> {
    void context;
    void limit;
    throw new Error("TODO: return result rows with abstract previews populated.");
  }

  async listFilters(context: ProviderContext): Promise<FilterGroup[]> {
    void context;
    throw new Error("TODO: list normalized filter groups and options.");
  }

  async applyFilters(context: ProviderContext, input: FilterApplyRequest[]): Promise<SearchSummary> {
    void context;
    void input;
    throw new Error("TODO: apply provider filters and return updated summary.");
  }

  async selectResultsByIndex(context: ProviderContext, indices: number[]): Promise<void> {
    void context;
    void indices;
    throw new Error("TODO: select result rows by page index.");
  }

  async clearSelection(context: ProviderContext): Promise<void> {
    void context;
    throw new Error("TODO: clear current result selection.");
  }

  async detectExportCapability(context: ProviderContext): Promise<ExportCapability> {
    void context;
    throw new Error("TODO: describe export format, scope, login blocker, and batch limits.");
  }

  async exportNative(context: ProviderContext, request: ExportRequest): Promise<ExportResult> {
    void context;
    void request;
    throw new Error("TODO: trigger native export and return saved file metadata.");
  }
}
