import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { PersistentProfileStore } from "../src/browser/persistent-profile-store.js";
import { SessionManager } from "../src/core/session-manager.js";
import { removePath } from "../src/utils/fs.js";

const cleanupPaths = new Set<string>();

afterEach(async () => {
  for (const targetPath of cleanupPaths) {
    await removePath(targetPath);
  }
  cleanupPaths.clear();
});

describe("SessionManager runtime startup", () => {
  it("releases a persistent profile lock when browser startup fails", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `agent-research-mcp-${randomUUID()}`);
    cleanupPaths.add(workspaceRoot);

    const profileStore = new PersistentProfileStore(path.join(workspaceRoot, ".agent-research-mcp", "auth"));
    const manager = new SessionManager({
      workspaceRoot,
      profileStore,
      playwrightFactory: {
        async createRuntime() {
          throw new Error("launch failed");
        },
        async closeRuntime() {
          return undefined;
        },
      } as never,
    });

    const first = await manager.createSession({ provider: "wos", persistentProfile: true, profileKey: "shared" });
    await expect(manager.ensureRuntime(first.record.id)).rejects.toThrow(/launch failed/i);

    const second = await manager.createSession({ provider: "wos", persistentProfile: true, profileKey: "shared" });
    await expect(manager.ensureRuntime(second.record.id)).rejects.toThrow(/launch failed/i);
  });
});
