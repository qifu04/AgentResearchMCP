import { rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium, type BrowserContext, type LaunchOptions, type ViewportSize } from "playwright";
import type { BrowserRuntime } from "../types/session.js";
import { resolveBrowserLaunchConfig, type BrowserLaunchConfig } from "./browser-launch-config.js";
import { OFF_SCREEN_ARGS } from "./window-position.js";
import { logger } from "../utils/logging.js";

const execFileAsync = promisify(execFile);

export interface LaunchContextOptions {
  viewport?: ViewportSize | null;
  downloadsPath: string;
  userDataDir?: string | null;
}

export interface PlaywrightFactoryOptions {
  launchConfig?: BrowserLaunchConfig;
}

export class PlaywrightFactory {
  private readonly launchConfig: BrowserLaunchConfig;

  constructor(options: PlaywrightFactoryOptions = {}) {
    this.launchConfig = options.launchConfig ?? resolveBrowserLaunchConfig();
  }

  async createRuntime(options: LaunchContextOptions): Promise<BrowserRuntime> {
    const launchOptions: LaunchOptions = {
      headless: false,
      args: this.buildLaunchArgs(),
    };

    if (options.userDataDir) {
      await cleanupPersistentProfileArtifacts(options.userDataDir);
      const context = await chromium.launchPersistentContext(options.userDataDir, {
        ...launchOptions,
        acceptDownloads: true,
        viewport: options.viewport ?? { width: 1440, height: 1100 },
        downloadsPath: options.downloadsPath,
      });
      const page = context.pages()[0] ?? (await context.newPage());
      return {
        context,
        page,
        persistent: true,
        userDataDir: options.userDataDir,
      };
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: options.viewport ?? { width: 1440, height: 1100 },
    });
    const page = await context.newPage();

    return {
      browser,
      context,
      page,
      persistent: false,
    };
  }

  async closeRuntime(runtime: BrowserRuntime | undefined): Promise<void> {
    if (!runtime) {
      return;
    }

    await closeContext(runtime.context);
    if (runtime.userDataDir) {
      await cleanupPersistentProfileArtifacts(runtime.userDataDir);
    }
    if (runtime.browser) {
      await runtime.browser.close();
    }
  }

  private buildLaunchArgs(): string[] {
    const args = [...OFF_SCREEN_ARGS];
    if (this.launchConfig.proxyMode === "direct") {
      args.push("--no-proxy-server");
    }
    return args;
  }
}

async function closeContext(context: BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch {
    // Ignore teardown errors during best-effort cleanup.
  }
}

async function cleanupPersistentProfileArtifacts(userDataDir: string): Promise<void> {
  await killChromeProcessesForUserDataDir(userDataDir);
  await removeProfileLockFiles(userDataDir);
}

async function killChromeProcessesForUserDataDir(userDataDir: string): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }

  const psScript = `
    $target = '${userDataDir.replace(/'/g, "''")}'
    Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" |
      Where-Object { $_.CommandLine -match [regex]::Escape($target) } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  `.trim();

  try {
    await execFileAsync("powershell", ["-NoProfile", "-Command", psScript], {
      windowsHide: true,
    });
  } catch (error) {
    logger.warn("Failed to cleanup stale Chromium processes for persistent profile", {
      userDataDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function removeProfileLockFiles(userDataDir: string): Promise<void> {
  const lockFiles = ["lockfile", "SingletonLock", "SingletonCookie", "SingletonSocket"];
  await Promise.all(
    lockFiles.map(async (fileName) => {
      try {
        await rm(path.join(userDataDir, fileName), { force: true });
      } catch {
        // Ignore missing files or transient cleanup failures.
      }
    }),
  );
}
