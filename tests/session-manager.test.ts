import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SessionManager } from "../src/core/session-manager.js";
import { removePath } from "../src/utils/fs.js";

const cleanupPaths = new Set<string>();

afterEach(async () => {
  for (const targetPath of cleanupPaths) {
    await removePath(targetPath);
  }
  cleanupPaths.clear();
});

describe("SessionManager", () => {
  it("creates headed sessions only", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `agent-research-mcp-${randomUUID()}`);
    cleanupPaths.add(workspaceRoot);

    const manager = new SessionManager({ workspaceRoot });
    const session = await manager.createSession({
      provider: "pubmed",
      persistentProfile: false,
    });

    expect(session.record.headed).toBe(true);
  });
});
