import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { ProviderRegistry } from "../adapters/registry.js";
import { SearchService } from "../services/search-service.js";
import { registerTools } from "./tool-registry.js";

const PORT = Number(process.env.MCP_PORT ?? 3100);

const providers = new ProviderRegistry();
const service = new SearchService(providers, {
  workspaceRoot: process.cwd(),
});

// Shared state: one MCP server + service, multiple transport sessions.
const transports = new Map<string, StreamableHTTPServerTransport | SSEServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "agent-research-mcp",
    version: "0.1.0",
  });
  registerTools(server, service, providers);
  return server;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // CORS for browser-based clients
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  // ---- Streamable HTTP: /mcp ----
  if (url.pathname === "/mcp") {
    await handleStreamableHttp(req, res);
    return;
  }

  // ---- Legacy SSE: GET /sse + POST /messages ----
  if (url.pathname === "/sse" && req.method === "GET") {
    await handleSseConnect(req, res);
    return;
  }
  if (url.pathname === "/messages" && req.method === "POST") {
    await handleSseMessage(req, res, url);
    return;
  }

  // ---- Health check ----
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, sessions: transports.size }));
    return;
  }

  res.writeHead(404).end("Not found");
});

// ---------------------------------------------------------------------------
// Streamable HTTP transport (protocol 2025-11-25)
// ---------------------------------------------------------------------------
async function handleStreamableHttp(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let transport: StreamableHTTPServerTransport | undefined;

  if (sessionId && transports.has(sessionId)) {
    const existing = transports.get(sessionId);
    if (existing instanceof StreamableHTTPServerTransport) {
      transport = existing;
    } else {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Session uses different transport" }, id: null }));
      return;
    }
  } else if (!sessionId && req.method === "POST") {
    const body = await readBody(req);
    if (isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }
  }

  if (transport) {
    const body = await readBody(req);
    await transport.handleRequest(req, res, body);
  } else {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session" }, id: null }));
  }
}

// ---------------------------------------------------------------------------
// Legacy SSE transport (protocol 2024-11-05)
// ---------------------------------------------------------------------------
async function handleSseConnect(
  _req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
): Promise<void> {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);
  res.on("close", () => transports.delete(transport.sessionId));
  const server = createMcpServer();
  await server.connect(transport);
}

async function handleSseMessage(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  url: URL,
): Promise<void> {
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const transport = transports.get(sessionId);
  if (transport instanceof SSEServerTransport) {
    const body = await readBody(req);
    await transport.handlePostMessage(req, res, body);
  } else {
    res.writeHead(400).end("Invalid session");
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(PORT, () => {
  console.log(`Agent Research MCP server listening on http://localhost:${PORT}`);
  console.log(`  Streamable HTTP: POST/GET/DELETE http://localhost:${PORT}/mcp`);
  console.log(`  Legacy SSE:      GET http://localhost:${PORT}/sse`);
  console.log(`  Health:          GET http://localhost:${PORT}/health`);
});

const shutdown = async () => {
  console.log("Shutting down...");
  for (const [sid, t] of transports) {
    await t.close().catch(() => undefined);
    transports.delete(sid);
  }
  httpServer.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());