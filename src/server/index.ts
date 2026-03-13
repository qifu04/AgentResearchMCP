import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProviderRegistry } from "../adapters/registry.js";
import { SearchService } from "../services/search-service.js";
import { registerTools } from "./tool-registry.js";

const providers = new ProviderRegistry();
const service = new SearchService(providers, {
  workspaceRoot: process.cwd(),
});

const server = new McpServer({
  name: "agent-research-mcp",
  version: "0.1.0",
});

registerTools(server, service, providers);

const transport = new StdioServerTransport();

await server.connect(transport);

const shutdown = async () => {
  await server.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
