import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SessionPhase } from "../adapters/provider-contract.js";
import { buildEnvelope, buildErrorEnvelope } from "../core/response-envelope.js";
import { isManualInterventionRequiredError } from "../core/manual-intervention.js";
import { ProviderRegistry } from "../adapters/registry.js";
import { SearchService } from "../services/search-service.js";

export function registerTools(server: McpServer, service: SearchService, providers: ProviderRegistry): void {
  server.registerTool(
    "create_session",
    {
      title: "Create Session",
      description: "Create a new isolated browser session and return the provider query-building profile.",
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
        const adapter = providers.get(record.provider);
        return okResult(
          buildEnvelope(
            {
              sessionId: record.id,
              provider: record.provider,
              displayName: adapter.descriptor.displayName,
              queryProfile: adapter.queryProfile,
            },
            {
              provider: record.provider,
              sessionId: record.id,
              phase: record.phase,
              nextActions: ["run_search", "read_current_query", "export_results"],
            },
          ),
        );
      } catch (error) {
        return errorResult("unknown", "create_session", "error", error);
      }
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
      return buildEnvelope(
        {
          sessionId: record.id,
          provider: record.provider,
          phase: record.phase,
        },
        {
          provider: record.provider,
          sessionId: record.id,
          phase: record.phase,
        },
      );
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
      return buildEnvelope(
        { query },
        {
          provider: record.provider,
          sessionId,
          phase: record.phase,
          nextActions: ["run_search", "export_results"],
        },
      );
    },
  );

  registerSessionTool(
    server,
    "run_search",
    "Execute a search and return the total result count plus the first titles and abstract previews.",
    {
      sessionId: z.string(),
      query: z.string().optional(),
      sampleSize: z.number().int().positive().max(20).optional(),
    },
    service,
    async ({ sessionId, query, sampleSize }) => {
      const record = await service.getSession(sessionId);
      const result = await service.runSearch(sessionId, { query, sampleSize });
      return buildEnvelope(result, {
        provider: record.provider,
        sessionId,
        phase: "search_ready",
        nextActions: ["read_current_query", "export_results"],
      });
    },
  );

  registerSessionTool(
    server,
    "export_results",
    "Export the current search results to RIS.",
    {
      sessionId: z.string(),
      outputDir: z.string().min(1).optional().describe("Custom output directory to copy the RIS file to."),
    },
    service,
    async ({ sessionId, outputDir }) => {
      const record = await service.getSession(sessionId);
      const result = await service.exportResults(sessionId, {
        request: {
          scope: "all",
          outputDir,
        },
      });
      return buildEnvelope(
        {
          path: result.path ?? null,
          fileName: result.fileName ?? null,
          format: "ris" as const,
        },
        {
          provider: record.provider,
          sessionId,
          phase: "completed",
        },
      );
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
        providers: providers.listDescriptors().map((descriptor) => ({
          id: descriptor.id,
          displayName: descriptor.displayName,
        })),
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
