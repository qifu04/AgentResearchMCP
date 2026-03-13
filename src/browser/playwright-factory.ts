import { chromium, type BrowserContext, type LaunchOptions, type Page, type ViewportSize } from "playwright";
import type { BrowserRuntime } from "../types/session.js";
import { OFF_SCREEN_ARGS } from "./window-position.js";

export interface LaunchContextOptions {
  viewport?: ViewportSize | null;
  downloadsPath: string;
  userDataDir?: string | null;
}

export class PlaywrightFactory {
  async createRuntime(options: LaunchContextOptions): Promise<BrowserRuntime> {
    const launchOptions: LaunchOptions = {
      headless: false,
      args: OFF_SCREEN_ARGS,
    };

    if (options.userDataDir) {
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
    if (runtime.browser) {
      await runtime.browser.close();
    }
  }
}

async function closeContext(context: BrowserContext): Promise<void> {
  try {
    await context.close();
  } catch {
    // Ignore teardown errors during best-effort cleanup.
  }
}
