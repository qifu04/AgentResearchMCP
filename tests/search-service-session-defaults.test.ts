import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderRegistry } from "../src/adapters/registry.js";
import { SearchService } from "../src/services/search-service.js";
import { removePath } from "../src/utils/fs.js";

const cleanupPaths = new Set<string>();

afterEach(async () => {
  for (const targetPath of cleanupPaths) {
    await removePath(targetPath);
  }
  cleanupPaths.clear();
});

describe("SearchService session defaults", () => {
  it("defaults login-gated providers to persistent profiles", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `agent-research-mcp-${randomUUID()}`);
    cleanupPaths.add(workspaceRoot);

    const service = new SearchService(new ProviderRegistry(), {
      workspaceRoot,
    });

    const wos = await service.createSession({ provider: "wos" });
    const pubmed = await service.createSession({ provider: "pubmed" });

    expect(wos.persistentProfile).toBe(true);
    expect(pubmed.persistentProfile).toBe(false);
  });

  it("preserves an explicit persistentProfile override", async () => {
    const workspaceRoot = path.join(os.tmpdir(), `agent-research-mcp-${randomUUID()}`);
    cleanupPaths.add(workspaceRoot);

    const service = new SearchService(new ProviderRegistry(), {
      workspaceRoot,
    });

    const record = await service.createSession({
      provider: "wos",
      persistentProfile: false,
    });

    expect(record.persistentProfile).toBe(false);
  });
});
