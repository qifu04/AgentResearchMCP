import { ProviderRegistry } from "../adapters/registry.js";
import { resolveBrowserLaunchConfig } from "../browser/browser-launch-config.js";
import { StartupPreflightCoordinator } from "../core/startup-preflight.js";
import { SearchService } from "../services/search-service.js";
import { logger } from "../utils/logging.js";

export interface InitializedServerRuntime {
  providers: ProviderRegistry;
  service: SearchService;
}

export async function initializeServerRuntime(workspaceRoot: string): Promise<InitializedServerRuntime> {
  const browserLaunchConfig = resolveBrowserLaunchConfig();
  logger.info("Browser launch configuration", browserLaunchConfig);

  const providers = new ProviderRegistry();
  const service = new SearchService(providers, {
    workspaceRoot,
  });

  const preflight = new StartupPreflightCoordinator(service, providers);
  await preflight.run();

  return {
    providers,
    service,
  };
}
