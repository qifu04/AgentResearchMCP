/**
 * Shared utility functions used across multiple adapters.
 */

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cssEscape(value: string): string {
  return value.replace(/["\\#.:]/g, "\\$&");
}

export function extractAbstractLine(text: string): string | null {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.length > 40) ?? null;
}
