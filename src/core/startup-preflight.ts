import type { ProviderDescriptor } from "../adapters/provider-contract.js";
import { logger } from "../utils/logging.js";
import { SearchService } from "../services/search-service.js";

export interface ProviderDescriptorSource {
  listDescriptors(): ProviderDescriptor[];
}

export interface StartupPreflightResult {
  provider: string;
  loginVerified: boolean;
  exportVerified: boolean;
  totalResults?: number | null;
}

export class StartupPreflightCoordinator {
  private readonly maxAttempts = 3;

  constructor(
    private readonly service: SearchService,
    private readonly providers: ProviderDescriptorSource,
  ) {}

  async run(): Promise<StartupPreflightResult[]> {
    const results: StartupPreflightResult[] = [];

    for (const descriptor of this.providers.listDescriptors()) {
      results.push(await this.runForProvider(descriptor));
    }

    logger.info("Startup preflight completed", { providers: results });
    return results;
  }

  private async runForProvider(descriptor: ProviderDescriptor): Promise<StartupPreflightResult> {
    logger.info("Startup preflight starting", {
      provider: descriptor.id,
      persistentProfile: descriptor.supportsManualLoginWait,
    });

    const session = await this.service.createSession({
      provider: descriptor.id,
      persistentProfile: descriptor.supportsManualLoginWait,
    });

    try {
      await this.runWithRetry(
        descriptor,
        session.id,
        "open advanced search",
        async () => this.service.openAdvancedSearch(session.id),
      );
      let loginState = await this.service.getLoginState(session.id);

      if (!loginState.canExport) {
        if (!descriptor.supportsManualLoginWait) {
          throw new Error(loginState.blockingReason ?? `${descriptor.displayName} is not export-ready.`);
        }

        logger.warn("Startup preflight waiting for user login", {
          provider: descriptor.id,
          blockingReason: loginState.blockingReason ?? null,
        });

        loginState = await this.service.waitForLogin(session.id, { capability: "export" });
        await this.runWithRetry(
          descriptor,
          session.id,
          "re-open advanced search after login",
          async () => this.service.openAdvancedSearch(session.id),
        );
      }

      const probe = await this.runWithRetry(
        descriptor,
        session.id,
        "startup probe",
        async () => this.service.runStartupProbe(session.id),
        async () => {
          await this.service.openAdvancedSearch(session.id);
        },
      );
      const result: StartupPreflightResult = {
        provider: descriptor.id,
        loginVerified: loginState.canExport,
        exportVerified: probe.exportVerified,
        totalResults: probe.totalResults ?? null,
      };

      logger.info("Startup preflight passed", result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Startup preflight failed", {
        provider: descriptor.id,
        error: message,
      });
      throw new Error(`Startup preflight failed for ${descriptor.displayName}: ${message}`);
    } finally {
      await this.service.closeSession(session.id).catch(() => undefined);
    }
  }

  private async runWithRetry<T>(
    descriptor: ProviderDescriptor,
    sessionId: string,
    stage: string,
    task: () => Promise<T>,
    recover?: () => Promise<void>,
  ): Promise<T> {
    let attempt = 0;

    while (attempt < this.maxAttempts) {
      attempt += 1;
      try {
        return await task();
      } catch (error) {
        if (!isRetryablePreflightError(error) || attempt >= this.maxAttempts) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        logger.warn("Startup preflight transient failure, retrying", {
          provider: descriptor.id,
          stage,
          attempt,
          nextAttempt: attempt + 1,
          error: message,
        });

        await recover?.().catch(() => undefined);
      }
    }

    throw new Error(`Startup preflight exhausted retries for ${descriptor.displayName} during ${stage}.`);
  }
}

function isRetryablePreflightError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return [
    "timeout",
    "timed out",
    "navigation",
    "net::err",
    "err_",
    "execution context was destroyed",
    "frame was detached",
    "target page, context or browser has been closed",
    "unable to find visible element",
    "failed to set expected input value",
    "waiting for selector",
    "waiting for locator",
  ].some((pattern) => message.includes(pattern));
}
