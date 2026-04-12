import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportManager } from "../src/core/export-manager.js";
import { ensureDir, pathExists, removePath, writeTextFile } from "../src/utils/fs.js";

const cleanupPaths = new Set<string>();

afterEach(async () => {
  vi.useRealTimers();
  for (const targetPath of cleanupPaths) {
    await removePath(targetPath);
  }
  cleanupPaths.clear();
});

describe("ExportManager", () => {
  it("adds a timestamp suffix to RIS exports and preserves it when copying to outputDir", async () => {
    const now = new Date("2026-04-08T08:09:10.111Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const workspaceRoot = path.join(os.tmpdir(), `agent-research-mcp-${randomUUID()}`);
    const downloadsDir = path.join(workspaceRoot, "downloads");
    const outputDir = path.join(workspaceRoot, "exports");
    cleanupPaths.add(workspaceRoot);

    await ensureDir(downloadsDir);

    const sourcePath = path.join(downloadsDir, "pubmed.ris");
    await writeTextFile(sourcePath, "TY  - JOUR\nER  - \n");

    const sessionManager = {
      ensureRuntime: vi.fn(async () => ({
        record: { provider: "pubmed" },
      })),
      buildProviderContext: vi.fn(() => ({
        provider: "pubmed",
        sessionId: "session-1",
        phase: "search_ready",
        artifactsDir: workspaceRoot,
        downloadsDir,
        page: {} as never,
      })),
      setPhase: vi.fn(async () => undefined),
    };

    const adapter = {
      exportNative: vi.fn(async () => ({
        provider: "pubmed",
        format: "ris" as const,
        path: sourcePath,
        fileName: "pubmed.ris",
      })),
    };

    const manager = new ExportManager(sessionManager as never);
    const exported = await manager.exportWithAdapter("session-1", adapter as never, { scope: "all" });
    const expectedFileName = `pubmed-${now.getTime()}.ris`;

    expect(exported.fileName).toBe(expectedFileName);
    expect(exported.path).toBe(path.join(downloadsDir, expectedFileName));
    expect(await pathExists(sourcePath)).toBe(false);
    expect(await readFile(exported.path!, "utf8")).toBe("TY  - JOUR\nER  - \n");

    const copied = await manager.copyToOutputDir(exported, outputDir);
    expect(copied.fileName).toBe(expectedFileName);
    expect(copied.path).toBe(path.join(outputDir, expectedFileName));
    expect(await readFile(copied.path!, "utf8")).toBe("TY  - JOUR\nER  - \n");
    expect(sessionManager.setPhase).toHaveBeenNthCalledWith(1, "session-1", "exporting");
    expect(sessionManager.setPhase).toHaveBeenNthCalledWith(2, "session-1", "completed");
  });
});
