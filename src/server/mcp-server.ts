import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ProviderRegistry } from "../adapters/registry.js";
import { SearchService } from "../services/search-service.js";
import { registerPrompts, AGENT_RESEARCH_MCP_INSTRUCTIONS } from "./prompt-registry.js";
import { registerTools } from "./tool-registry.js";

export function createConfiguredMcpServer(service: SearchService, providers: ProviderRegistry): McpServer {
  const server = new McpServer(
    {
      name: "agent-research-mcp",
      version: "0.1.0",
    },
    {
      instructions: AGENT_RESEARCH_MCP_INSTRUCTIONS,
    },
  );

  registerTools(server, service, providers);
  registerPrompts(server);

  return server;
}
