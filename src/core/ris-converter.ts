import path from "node:path";
import { readFile } from "node:fs/promises";
import { writeTextFile } from "../utils/fs.js";

export class RisConverter {
  async convertFileToRis(filePath: string, format?: string): Promise<string> {
    const ext = (format ?? path.extname(filePath).replace(".", "")).toLowerCase();
    if (ext === "ris") {
      return filePath;
    }

    if (ext === "nbib") {
      const content = await readFile(filePath, "utf8");
      const ris = convertNbibToRis(content);
      const outputPath = filePath.replace(/\.nbib$/i, ".ris");
      await writeTextFile(outputPath, ris);
      return outputPath;
    }

    throw new Error(`RIS conversion is not implemented for format: ${ext}`);
  }

  async mergeRisFiles(filePaths: string[], targetPath: string): Promise<string> {
    const chunks = await Promise.all(filePaths.map((filePath) => readFile(filePath, "utf8")));
    await writeTextFile(targetPath, `${chunks.join("\n")}\n`);
    return targetPath;
  }
}

export function convertNbibToRis(nbib: string): string {
  const normalized = nbib.replace(/\r\n/g, "\n");
  const blocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const entries = blocks.map((block) => parseNbibBlock(block));
  return entries.map(formatRisEntry).join("\n");
}

type NbibRecord = {
  type: string;
  title?: string;
  journal?: string;
  year?: string;
  abstract?: string;
  authors: string[];
  doi?: string;
  volume?: string;
  issue?: string;
  startPage?: string;
  endPage?: string;
  keywords: string[];
  pmid?: string;
};

function parseNbibBlock(block: string): NbibRecord {
  const fields = new Map<string, string[]>();
  let currentKey: string | null = null;

  for (const line of block.split("\n")) {
    const match = /^([A-Z0-9]{2,4})\s*-\s*(.*)$/.exec(line);
    if (match) {
      currentKey = match[1];
      const list = fields.get(currentKey) ?? [];
      list.push(match[2].trim());
      fields.set(currentKey, list);
      continue;
    }

    if (currentKey) {
      const list = fields.get(currentKey) ?? [];
      const value = `${list.pop() ?? ""} ${line.trim()}`.trim();
      list.push(value);
      fields.set(currentKey, list);
    }
  }

  const pageField = firstValue(fields, "PG");
  const [startPage, endPage] = pageField?.split("-") ?? [];
  const publicationTypes = fields.get("PT") ?? [];

  return {
    type: publicationTypes.some((value) => value.toLowerCase().includes("book")) ? "BOOK" : "JOUR",
    title: firstValue(fields, "TI"),
    journal: firstValue(fields, "JT") ?? firstValue(fields, "TA"),
    year: firstValue(fields, "DP")?.match(/\d{4}/)?.[0],
    abstract: firstValue(fields, "AB"),
    authors: fields.get("AU") ?? [],
    doi: findDoi(fields.get("LID") ?? []),
    volume: firstValue(fields, "VI"),
    issue: firstValue(fields, "IP"),
    startPage,
    endPage,
    keywords: fields.get("MH") ?? [],
    pmid: firstValue(fields, "PMID"),
  };
}

function formatRisEntry(record: NbibRecord): string {
  const lines: string[] = [];
  lines.push(`TY  - ${record.type}`);

  for (const author of record.authors) {
    lines.push(`AU  - ${author}`);
  }

  if (record.title) {
    lines.push(`TI  - ${record.title}`);
  }
  if (record.journal) {
    lines.push(`JO  - ${record.journal}`);
  }
  if (record.year) {
    lines.push(`PY  - ${record.year}`);
  }
  if (record.volume) {
    lines.push(`VL  - ${record.volume}`);
  }
  if (record.issue) {
    lines.push(`IS  - ${record.issue}`);
  }
  if (record.startPage) {
    lines.push(`SP  - ${record.startPage}`);
  }
  if (record.endPage) {
    lines.push(`EP  - ${record.endPage}`);
  }
  if (record.abstract) {
    lines.push(`AB  - ${record.abstract}`);
  }
  if (record.doi) {
    lines.push(`DO  - ${record.doi}`);
  }
  if (record.pmid) {
    lines.push(`ID  - PMID:${record.pmid}`);
  }
  for (const keyword of record.keywords) {
    lines.push(`KW  - ${keyword}`);
  }

  lines.push("ER  - ");
  return `${lines.join("\n")}\n`;
}

function firstValue(fields: Map<string, string[]>, key: string): string | undefined {
  return fields.get(key)?.[0];
}

function findDoi(values: string[]): string | undefined {
  for (const value of values) {
    const match = /(.+?)\s*\[doi\]$/i.exec(value);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}
