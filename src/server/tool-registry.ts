import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionPhase } from "../adapters/provider-contract.js";
import { buildEnvelope, buildErrorEnvelope } from "../core/response-envelope.js";
import { isManualInterventionRequiredError } from "../core/manual-intervention.js";
import { ProviderRegistry } from "../adapters/registry.js";
import { SearchService } from "../services/search-service.js";
import { WORKFLOW_GUIDE } from "./workflow-guide.js";

export function registerTools(server: McpServer, service: SearchService, providers: ProviderRegistry): void {
  server.registerTool(
    "create_session",
    {
      title: "Create Session",
      description: "Create a new isolated browser session for a scholarly provider.",
      inputSchema: {
        provider: z.string(),
        profileKey: z.string().optional(),
        persistentProfile: z.boolean().optional(),
      },
    },
    async ({ provider, profileKey, persistentProfile }) => {
      try {
        const record = await service.createSession({
          provider,
          profileKey,
          persistentProfile,
        });
        return okResult(
          buildEnvelope(record, {
            provider: record.provider,
            sessionId: record.id,
            phase: record.phase,
            nextActions: ["open_advanced_search"],
          }),
        );
      } catch (error) {
        return errorResult("unknown", "create_session", "error", error);
      }
    },
  );

  server.registerTool(
    "list_sessions",
    {
      title: "List Sessions",
      description: "List all active sessions known to the server.",
      inputSchema: {},
    },
    async () => {
      const sessions = await service.listSessions();
      return okResult({
        ok: true,
        sessions,
      });
    },
  );

  registerSessionTool(
    server,
    "get_session",
    "Get session metadata.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      return buildEnvelope(record, {
        provider: record.provider,
        sessionId: record.id,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "close_session",
    "Close an active browser session.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.closeSession(sessionId);
      return buildEnvelope(record, {
        provider: record.provider,
        sessionId: record.id,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "open_advanced_search",
    "Open the provider advanced-search entry page.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.openAdvancedSearch(sessionId);
      return buildEnvelope(record, {
        provider: record.provider,
        sessionId: record.id,
        phase: record.phase,
        nextActions: ["get_query_language_profile", "run_search"],
      });
    },
  );

  registerSessionTool(
    server,
    "get_login_state",
    "Detect the current provider login and access state.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      const loginState = await service.getLoginState(sessionId);
      return buildEnvelope(loginState, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
        nextActions: loginState.canSearch ? ["get_query_language_profile", "run_search"] : ["wait_for_login"],
      });
    },
  );

  registerSessionTool(
    server,
    "wait_for_login",
    "Wait until the provider session becomes usable for search or export.",
    {
      sessionId: z.string(),
      capability: z.enum(["search", "export", "personal"]).optional(),
      timeoutMs: z.number().int().positive().optional(),
      pollMs: z.number().int().positive().optional(),
    },
    service,
    async ({ sessionId, capability, timeoutMs, pollMs }) => {
      const record = await service.getSession(sessionId);
      const loginState = await service.waitForLogin(sessionId, { capability, timeoutMs, pollMs });
      const updated = await service.getSession(sessionId);
      return buildEnvelope(loginState, {
        provider: record.provider,
        sessionId,
        phase: updated.phase,
        nextActions: ["get_query_language_profile", "run_search"],
      });
    },
  );

  registerSessionTool(
    server,
    "get_query_language_profile",
    "Return structured query-language rules for the current provider.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      const profile = await service.getQueryLanguageProfile(sessionId);
      return buildEnvelope(profile, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
        nextActions: ["set_query", "run_search"],
      });
    },
  );

  registerSessionTool(
    server,
    "read_current_query",
    "Read the current provider query text.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      const query = await service.readCurrentQuery(sessionId);
      return buildEnvelope({ query }, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "set_query",
    "Set the current provider query text.",
    {
      sessionId: z.string(),
      query: z.string().min(1),
    },
    service,
    async ({ sessionId, query }) => {
      const record = await service.getSession(sessionId);
      const currentQuery = await service.setQuery(sessionId, query);
      return buildEnvelope({ query: currentQuery }, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
        nextActions: ["run_search"],
      });
    },
  );

  registerSessionTool(
    server,
    "run_search",
    "Execute a search and return normalized titles, abstracts, filters, and export capability.",
    {
      sessionId: z.string(),
      query: z.string().optional(),
      sampleSize: z.number().int().positive().max(20).optional(),
    },
    service,
    async ({ sessionId, query, sampleSize }) => {
      const record = await service.getSession(sessionId);
      const observation = await service.runSearch(sessionId, { query, sampleSize });
      return buildEnvelope(observation, {
        provider: record.provider,
        sessionId,
        phase: "search_ready",
        nextActions: ["apply_filters", "export_results"],
      });
    },
  );

  registerSessionTool(
    server,
    "read_search_summary",
    "Read the current normalized search summary.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      const summary = await service.readSearchSummary(sessionId);
      return buildEnvelope(summary, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "read_result_sample",
    "Read the first N result items including abstract previews when available.",
    {
      sessionId: z.string(),
      limit: z.number().int().positive().max(20).optional(),
    },
    service,
    async ({ sessionId, limit }) => {
      const record = await service.getSession(sessionId);
      const items = await service.readResultSample(sessionId, limit ?? 5);
      return buildEnvelope(items, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "list_filters",
    "List normalized filter groups for the current provider page.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      const filters = await service.listFilters(sessionId);
      return buildEnvelope(filters, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "apply_filters",
    "Apply provider filters and return an updated normalized observation.",
    {
      sessionId: z.string(),
      filters: z.array(
        z.object({
          key: z.string(),
          values: z.array(z.string()).optional(),
          from: z.union([z.string(), z.number()]).nullable().optional(),
          to: z.union([z.string(), z.number()]).nullable().optional(),
        }),
      ),
    },
    service,
    async ({ sessionId, filters }) => {
      const record = await service.getSession(sessionId);
      const observation = await service.applyFilters(sessionId, filters);
      return buildEnvelope(observation, {
        provider: record.provider,
        sessionId,
        phase: "search_ready",
        nextActions: ["read_result_sample", "export_results"],
      });
    },
  );

  registerSessionTool(
    server,
    "select_results",
    "Select result rows by 1-based index.",
    {
      sessionId: z.string(),
      indices: z.array(z.number().int().positive()).min(1),
    },
    service,
    async ({ sessionId, indices }) => {
      const record = await service.getSession(sessionId);
      await service.selectResults(sessionId, indices);
      return buildEnvelope({ selected: indices }, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
        nextActions: ["export_results", "clear_selection"],
      });
    },
  );

  registerSessionTool(
    server,
    "clear_selection",
    "Clear current result selection.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      await service.clearSelection(sessionId);
      return buildEnvelope({ cleared: true }, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "get_export_capability",
    "Describe the export formats, scopes, limits, and blockers for the current provider.",
    { sessionId: z.string() },
    service,
    async ({ sessionId }) => {
      const record = await service.getSession(sessionId);
      const capability = await service.getExportCapability(sessionId);
      return buildEnvelope(capability, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "export_results",
    "Export all search results as RIS.",
    {
      sessionId: z.string(),
      request: z.object({
        scope: z.literal("all").default("all"),
        includeAbstracts: z.boolean().optional(),
        outputDir: z.string().min(1).optional().describe("Custom output directory to copy the exported file to."),
      }),
    },
    service,
    async ({ sessionId, request }) => {
      const record = await service.getSession(sessionId);
      const result = await service.exportResults(sessionId, { request });
      return buildEnvelope(result, {
        provider: record.provider,
        sessionId,
        phase: "completed",
      });
    },
  );

  registerSessionTool(
    server,
    "convert_export_to_ris",
    "Convert an existing native export file to RIS when supported.",
    {
      sessionId: z.string(),
      filePath: z.string().min(1),
      format: z.string().optional(),
    },
    service,
    async ({ sessionId, filePath, format }) => {
      const record = await service.getSession(sessionId);
      const risPath = await service.convertExportToRis(sessionId, filePath, format);
      return buildEnvelope({ path: risPath }, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  registerSessionTool(
    server,
    "capture_session_artifacts",
    "Capture DOM, screenshot, storage, and network artifacts for the active session.",
    {
      sessionId: z.string(),
      label: z.string().optional(),
    },
    service,
    async ({ sessionId, label }) => {
      const record = await service.getSession(sessionId);
      const artifacts = await service.captureSessionArtifacts(sessionId, label);
      return buildEnvelope(artifacts, {
        provider: record.provider,
        sessionId,
        phase: record.phase,
      });
    },
  );

  server.registerTool(
    "list_providers",
    {
      title: "List Providers",
      description: "List the providers currently registered in this MCP server.",
      inputSchema: {},
    },
    async () =>
      okResult({
        ok: true,
        providers: providers.listDescriptors(),
      }),
  );

  server.registerTool(
    "get_workflow_guide",
    {
      title: "Get Workflow Guide",
      description: "Returns a comprehensive guide for AI agents on the correct order and method to use all MCP tools.",
      inputSchema: {},
    },
    async () =>
      okResult({
        ok: true,
        guide: WORKFLOW_GUIDE,
      }),
  );
}

function registerSessionTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Record<string, z.ZodType>,
  service: SearchService,
  handler: (args: any) => Promise<unknown>,
): void {
  (server.registerTool as any)(
    name,
    {
      title: name,
      description,
      inputSchema,
    },
    async (args: any, _extra: any) => {
      const typedArgs = args;
      try {
        const payload = await handler(typedArgs);
        return okResult(payload);
      } catch (error) {
        const sessionId = "sessionId" in typedArgs ? String(typedArgs.sessionId) : name;
        let provider = "unknown";
        let phase: SessionPhase = "error";
        try {
          const session = await service.getSession(sessionId);
          provider = session.provider;
          phase = session.phase;
        } catch {
          // ignore
        }
        return errorResult(provider, sessionId, phase, error);
      }
    },
  );
}

function okResult(payload: unknown) {
  return {
    structuredContent: payload as unknown as Record<string, unknown>,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(provider: string, sessionId: string, phase: SessionPhase, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const manualIntervention = isManualInterventionRequiredError(error) ? error : null;
  const envelope = buildErrorEnvelope(message, {
    provider,
    sessionId,
    phase,
    warnings: manualIntervention ? [`Manual intervention required: ${manualIntervention.blockerType ?? "unknown"}`] : undefined,
    nextActions: manualIntervention ? ["get_session", "capture_session_artifacts"] : undefined,
    raw: manualIntervention
      ? {
          blockerType: manualIntervention.blockerType,
          selectors: manualIntervention.selectors,
          instructions: manualIntervention.instructions,
        }
      : undefined,
  });

  return {
    isError: true,
    structuredContent: envelope as unknown as Record<string, unknown>,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(envelope, null, 2),
      },
    ],
  };
}
