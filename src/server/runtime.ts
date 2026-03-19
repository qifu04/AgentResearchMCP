import { ProviderRegistry } from "../adapters/registry.js";
import { resolveBrowserLaunchConfig } from "../browser/browser-launch-config.js";
import { resolveStartupPreflightOptions, StartupPreflightCoordinator } from "../core/startup-preflight.js";
import { SearchService } from "../services/search-service.js";
import { logger } from "../utils/logging.js";

export interface InitializedServerRuntime {
  providers: ProviderRegistry;
  service: SearchService;
}

export async function initializeServerRuntime(workspaceRoot: string): Promise<InitializedServerRuntime> {
  const browserLaunchConfig = resolveBrowserLaunchConfig();
  const requestedPreflightOptions = resolveStartupPreflightOptions();
  if (
    requestedPreflightOptions.mode !== "full" ||
    (requestedPreflightOptions.providers && requestedPreflightOptions.providers.length > 0)
  ) {
    logger.warn("Server startup keeps strict full preflight; provider and mode overrides are ignored here", {
      requestedMode: requestedPreflightOptions.mode,
      requestedProviders: requestedPreflightOptions.providers ?? null,
      debugCommand: "npm run debug:preflight",
    });
  }
  const startupPreflightOptions = {
    ...requestedPreflightOptions,
    providers: undefined,
    mode: "full" as const,
  };
  logger.info("Browser launch configuration", browserLaunchConfig);
  logger.info("Startup preflight configuration", startupPreflightOptions);

  const providers = new ProviderRegistry();
  const service = new SearchService(providers, {
    workspaceRoot,
  });

  const preflight = new StartupPreflightCoordinator(service, providers, startupPreflightOptions);
  await preflight.run();

  return {
    providers,
    service,
  };
}
