import { describe, expect, it } from "vitest";
import { resolveBrowserLaunchConfig } from "../src/browser/browser-launch-config.js";

describe("resolveBrowserLaunchConfig", () => {
  it("defaults to direct mode", () => {
    expect(resolveBrowserLaunchConfig({} as NodeJS.ProcessEnv)).toEqual({
      proxyMode: "direct",
    });
  });

  it("accepts explicit system mode", () => {
    expect(resolveBrowserLaunchConfig({ BROWSER_PROXY_MODE: "system" } as NodeJS.ProcessEnv)).toEqual({
      proxyMode: "system",
    });
  });

  it("supports boolean compatibility env", () => {
    expect(resolveBrowserLaunchConfig({ BROWSER_USE_SYSTEM_PROXY: "1" } as NodeJS.ProcessEnv)).toEqual({
      proxyMode: "system",
    });
    expect(resolveBrowserLaunchConfig({ BROWSER_USE_SYSTEM_PROXY: "0" } as NodeJS.ProcessEnv)).toEqual({
      proxyMode: "direct",
    });
  });

  it("rejects invalid values", () => {
    expect(() => resolveBrowserLaunchConfig({ BROWSER_PROXY_MODE: "corp" } as NodeJS.ProcessEnv)).toThrow(
      /BROWSER_PROXY_MODE/i,
    );
  });
});
