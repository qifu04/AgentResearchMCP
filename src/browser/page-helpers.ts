import type { Locator, Page } from "playwright";

export async function textContentOrNull(locator: Locator): Promise<string | null> {
  try {
    const text = await locator.textContent();
    return text?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function clickIfVisible(locator: Locator): Promise<boolean> {
  try {
    if (!(await locator.isVisible())) {
      return false;
    }
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

export async function fillAndVerify(locator: Locator, value: string): Promise<void> {
  await locator.fill(value);
  const filled = await locator.inputValue();
  if (filled !== value) {
    throw new Error("Failed to set expected input value.");
  }
}

export async function waitForDocumentReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

export async function runWithPageLoad<T>(page: Page, action: () => Promise<T>): Promise<T> {
  await waitForDocumentReady(page);
  const result = await action();
  await waitForDocumentReady(page);
  return result;
}

export function normalizeWhitespace(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.replace(/\s+/g, " ").trim() || null;
}
