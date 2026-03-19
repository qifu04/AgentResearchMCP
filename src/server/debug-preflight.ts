import { performance } from "node:perf_hooks";
import { ProviderRegistry } from "../adapters/registry.js";
import { resolveBrowserLaunchConfig } from "../browser/browser-launch-config.js";
import { resolveStartupPreflightOptions, StartupPreflightCoordinator } from "../core/startup-preflight.js";
import { SearchService } from "../services/search-service.js";
import { logger } from "../utils/logging.js";

async function main(): Promise<void> {
  const browserLaunchConfig = resolveBrowserLaunchConfig();
  const startupPreflightOptions = resolveStartupPreflightOptions();
  logger.info("Browser launch configuration", browserLaunchConfig);
  logger.info("Startup preflight configuration", startupPreflightOptions);

  const providers = new ProviderRegistry();
  const service = new SearchService(providers, {
    workspaceRoot: process.cwd(),
  });
  const coordinator = new StartupPreflightCoordinator(service, providers, startupPreflightOptions);

  const startedAt = performance.now();
  const results = await coordinator.run();
  console.log(
    JSON.stringify(
      {
        ok: true,
        elapsedMs: Math.round(performance.now() - startedAt),
        results,
      },
      null,
      2,
    ),
  );
}

await main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
