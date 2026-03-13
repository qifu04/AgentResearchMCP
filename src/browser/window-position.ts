import { exec } from "node:child_process";
import type { Page } from "playwright";

/**
 * Chromium launch args that place the window far off-screen.
 * The browser is still headed (GPU-rendered) but invisible to the user.
 */
export const OFF_SCREEN_ARGS = ["--window-position=-32000,-32000"];

/**
 * Send a Windows toast notification. No-op on non-Windows platforms.
 */
export function notifyUser(title: string, body: string): void {
  if (process.platform !== "win32") return;
  const ps = `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
    $xml.LoadXml("<toast><visual><binding template='ToastGeneric'><text>${title.replace(/'/g, "''")}</text><text>${body.replace(/'/g, "''")}</text></binding></visual></toast>")
    $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Agent Research MCP').Show($toast)
  `.trim();
  exec(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, () => {});
}

/**
 * Move the browser window back to a visible screen position via CDP.
 */
export async function bringWindowOnScreen(page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { left: 100, top: 100, windowState: "normal" },
    });
    await cdp.detach();
  } catch {
    // Fallback: some Chromium builds lack Browser domain — just bring to front.
    await page.bringToFront();
  }
}

/**
 * Move the browser window back off-screen via CDP.
 */
export async function sendWindowOffScreen(page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { left: -32000, top: -32000, windowState: "normal" },
    });
    await cdp.detach();
  } catch {
    // Best-effort — if CDP is unavailable, window stays where it is.
  }
}
