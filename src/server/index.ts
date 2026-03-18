import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tool-registry.js";
import { initializeServerRuntime } from "./runtime.js";

async function main(): Promise<void> {
  const { providers, service } = await initializeServerRuntime(process.cwd());

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
}

await main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
