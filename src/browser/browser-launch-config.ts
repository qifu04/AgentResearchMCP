export type BrowserProxyMode = "direct" | "system";

export interface BrowserLaunchConfig {
  proxyMode: BrowserProxyMode;
}

export function resolveBrowserLaunchConfig(env: NodeJS.ProcessEnv = process.env): BrowserLaunchConfig {
  return {
    proxyMode: resolveBrowserProxyMode(env),
  };
}

function resolveBrowserProxyMode(env: NodeJS.ProcessEnv): BrowserProxyMode {
  const explicitMode = env.BROWSER_PROXY_MODE?.trim();
  if (explicitMode) {
    const normalizedMode = explicitMode.toLowerCase();
    if (normalizedMode === "direct") {
      return "direct";
    }
    if (normalizedMode === "system") {
      return "system";
    }
    throw new Error(`Invalid BROWSER_PROXY_MODE \"${env.BROWSER_PROXY_MODE}\". Expected \"direct\" or \"system\".`);
  }

  const useSystemProxy = env.BROWSER_USE_SYSTEM_PROXY?.trim();
  if (!useSystemProxy) {
    return "direct";
  }

  const normalized = useSystemProxy.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return "system";
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return "direct";
  }

  throw new Error(
    `Invalid BROWSER_USE_SYSTEM_PROXY \"${env.BROWSER_USE_SYSTEM_PROXY}\". Expected a boolean value such as 0/1 or true/false.`,
  );
}
