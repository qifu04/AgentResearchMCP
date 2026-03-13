import path from "node:path";
import type { Page } from "playwright";
import type { SessionPaths } from "../types/session.js";
import { ensureDir, writeJsonFile, writeTextFile } from "../utils/fs.js";

export class ArtifactManager {
  async ensureSessionPaths(rootDir: string): Promise<SessionPaths> {
    const domDir = path.join(rootDir, "dom");
    const networkDir = path.join(rootDir, "network");
    const storageDir = path.join(rootDir, "storage");
    const downloadsDir = path.join(rootDir, "downloads");
    const exportsDir = path.join(rootDir, "exports");
    const screenshotsDir = path.join(rootDir, "screenshots");

    await Promise.all([
      ensureDir(rootDir),
      ensureDir(domDir),
      ensureDir(networkDir),
      ensureDir(storageDir),
      ensureDir(downloadsDir),
      ensureDir(exportsDir),
      ensureDir(screenshotsDir),
    ]);

    return {
      rootDir,
      domDir,
      networkDir,
      storageDir,
      downloadsDir,
      exportsDir,
      screenshotsDir,
      sessionFile: path.join(rootDir, "session.json"),
      stateFile: path.join(rootDir, "state.json"),
    };
  }

  async captureDomSnapshot(page: Page, paths: SessionPaths, label: string): Promise<string> {
    const targetPath = path.join(paths.domDir, `${sanitizeLabel(label)}.html`);
    await writeTextFile(targetPath, await page.content());
    return targetPath;
  }

  async captureScreenshot(page: Page, paths: SessionPaths, label: string): Promise<string> {
    const targetPath = path.join(paths.screenshotsDir, `${sanitizeLabel(label)}.png`);
    await page.screenshot({ path: targetPath, fullPage: true });
    return targetPath;
  }

  async captureStorageState(page: Page, paths: SessionPaths, label: string): Promise<string> {
    const targetPath = path.join(paths.storageDir, `${sanitizeLabel(label)}.json`);
    const state = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
    }));
    await writeJsonFile(targetPath, state);
    return targetPath;
  }

  async captureNetworkLog(paths: SessionPaths, label: string, entries: unknown[]): Promise<string> {
    const targetPath = path.join(paths.networkDir, `${sanitizeLabel(label)}.json`);
    await writeJsonFile(targetPath, entries);
    return targetPath;
  }
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "artifact";
}
