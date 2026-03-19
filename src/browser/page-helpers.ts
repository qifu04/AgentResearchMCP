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
    await locator.click({
      timeout: 1_500,
      noWaitAfter: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function readLocatorValue(locator: Locator): Promise<string | null> {
  try {
    return normalizeWhitespace(
      await locator.evaluate((node) => {
        if (
          node instanceof HTMLInputElement ||
          node instanceof HTMLTextAreaElement ||
          node instanceof HTMLSelectElement
        ) {
          return node.value;
        }

        if (!(node instanceof HTMLElement)) {
          return null;
        }

        if (node.isContentEditable || node.getAttribute("contenteditable") === "true") {
          return node.innerText || node.textContent;
        }

        return node.textContent;
      }),
    );
  } catch {
    return null;
  }
}

export async function fillAndVerify(locator: Locator, value: string): Promise<void> {
  try {
    await locator.fill(value);
  } catch (error) {
    const isContentEditable = await locator
      .evaluate(
        (node) => node instanceof HTMLElement && (node.isContentEditable || node.getAttribute("contenteditable") === "true"),
      )
      .catch(() => false);

    if (!isContentEditable) {
      throw error;
    }

    await locator.evaluate((node, nextValue) => {
      if (!(node instanceof HTMLElement)) {
        throw new Error("Editable element was not found.");
      }

      node.focus();
      node.textContent = nextValue;
      node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: nextValue }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  }

  const filled = await readLocatorValue(locator);
  if (normalizeWhitespace(filled) !== normalizeWhitespace(value)) {
    throw new Error("Failed to set expected input value.");
  }
}

export async function waitForDocumentReady(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  if (!shouldWaitForNetworkIdle(page)) {
    return;
  }
  // Use a short timeout for networkidle. Some providers keep background
  // requests alive (analytics, telemetry), so this remains best-effort.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
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

function shouldWaitForNetworkIdle(page: Page): boolean {
  try {
    const url = page.url();
    if (!url || url === "about:blank") {
      return true;
    }

    const hostname = new URL(url).hostname.toLowerCase();
    if (
      hostname.includes("ieeexplore.ieee.org") ||
      hostname.includes("webofscience") ||
      hostname.includes("clarivate.cn")
    ) {
      return false;
    }
  } catch {
    return true;
  }

  return true;
}
