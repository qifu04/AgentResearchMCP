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

    if (ext === "csv") {
      const content = await readFile(filePath, "utf8");
      const ris = convertCsvToRis(content);
      const outputPath = filePath.replace(/\.csv$/i, ".ris");
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

/** Convert IEEE Xplore CSV export to RIS. */
export function convertCsvToRis(csv: string): string {
  const rows = parseCsvRows(csv);
  if (rows.length < 2) return "";

  const headers = rows[0];
  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? row[idx]?.trim() ?? "" : "";
  };

  const entries: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue;

    const lines: string[] = [];
    const docId = col(row, "Document Identifier");
    const isConf = /conference/i.test(col(row, "Publication Title")) || /IEECONF/i.test(docId);
    lines.push(`TY  - ${isConf ? "CONF" : "JOUR"}`);

    const title = col(row, "Document Title");
    if (title) lines.push(`TI  - ${title}`);

    const authors = col(row, "Authors");
    if (authors) {
      for (const a of authors.split(";")) {
        const name = a.trim();
        if (name) lines.push(`AU  - ${name}`);
      }
    }

    const pub = col(row, "Publication Title");
    if (pub) lines.push(isConf ? `T2  - ${pub}` : `JO  - ${pub}`);

    const year = col(row, "Publication Year");
    if (year) lines.push(`PY  - ${year}`);

    const vol = col(row, "Volume");
    if (vol) lines.push(`VL  - ${vol}`);

    const issue = col(row, "Issue");
    if (issue) lines.push(`IS  - ${issue}`);

    const sp = col(row, "Start Page");
    if (sp) lines.push(`SP  - ${sp}`);

    const ep = col(row, "End Page");
    if (ep) lines.push(`EP  - ${ep}`);

    const ab = col(row, "Abstract");
    if (ab) lines.push(`AB  - ${ab}`);

    const doi = col(row, "DOI");
    if (doi) lines.push(`DO  - ${doi}`);

    const issn = col(row, "ISSN");
    if (issn) lines.push(`SN  - ${issn}`);

    const publisher = col(row, "Publisher");
    if (publisher) lines.push(`PB  - ${publisher}`);

    const kw = col(row, "Author Keywords");
    if (kw) {
      for (const k of kw.split(";")) {
        const keyword = k.trim();
        if (keyword) lines.push(`KW  - ${keyword}`);
      }
    }

    lines.push("ER  - ");
    entries.push(`${lines.join("\n")}\n`);
  }

  return entries.join("\n");
}

/** Minimal RFC 4180 CSV parser. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let pos = 0;

  while (pos <= normalized.length) {
    const row: string[] = [];
    while (true) {
      let value: string;
      if (normalized[pos] === '"') {
        pos++; // skip opening quote
        let end = pos;
        while (end < normalized.length) {
          if (normalized[end] === '"') {
            if (normalized[end + 1] === '"') {
              end += 2; // escaped quote
            } else {
              break;
            }
          } else {
            end++;
          }
        }
        value = normalized.slice(pos, end).replace(/""/g, '"');
        pos = end + 1; // skip closing quote
      } else {
        const end = normalized.indexOf(",", pos);
        const nl = normalized.indexOf("\n", pos);
        const stop = end >= 0 && (nl < 0 || end < nl) ? end : (nl >= 0 ? nl : normalized.length);
        value = normalized.slice(pos, stop);
        pos = stop;
      }
      row.push(value);

      if (pos >= normalized.length || normalized[pos] === "\n") {
        pos++; // skip newline
        break;
      }
      if (normalized[pos] === ",") {
        pos++; // skip comma
      }
    }
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
  }

  return rows;
}
