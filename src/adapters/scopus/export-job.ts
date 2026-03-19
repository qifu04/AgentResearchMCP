export interface ScopusBulkExportInitiateResponse {
  bulkExportId?: string | null;
}

export interface ScopusBulkJob {
  jobId: string;
  status: string;
  fileUrl?: string | null;
}

export interface ScopusBulkJobsResponse {
  jobs?: ScopusBulkJob[];
}

export interface ScopusGenerateUrlResponse {
  presignedUrl?: string | null;
}

export function parseScopusBulkExportId(payload: string): string | null {
  const parsed = parseJson<ScopusBulkExportInitiateResponse>(payload);
  return normalizeNonEmptyString(parsed?.bulkExportId);
}

export function findScopusBulkJob(
  payload: string | ScopusBulkJobsResponse,
  bulkExportId: string,
): ScopusBulkJob | null {
  const parsed = typeof payload === "string" ? parseJson<ScopusBulkJobsResponse>(payload) : payload;
  if (!parsed?.jobs || !Array.isArray(parsed.jobs)) {
    return null;
  }

  return (
    parsed.jobs.find(
      (job): job is ScopusBulkJob =>
        Boolean(job) &&
        typeof job.jobId === "string" &&
        job.jobId === bulkExportId &&
        typeof job.status === "string",
    ) ?? null
  );
}

export function parseScopusPresignedUrl(payload: string): string | null {
  const parsed = parseJson<ScopusGenerateUrlResponse>(payload);
  return normalizeNonEmptyString(parsed?.presignedUrl);
}

export function deriveScopusExportFileName(presignedUrl: string, fallback?: string | null): string {
  const fallbackName = normalizeNonEmptyString(fallback);
  if (fallbackName) {
    return sanitizeFileName(fallbackName);
  }

  try {
    const url = new URL(presignedUrl);
    const disposition = url.searchParams.get("response-content-disposition");
    const dispositionName = disposition ? extractDispositionFileName(disposition) : null;
    if (dispositionName) {
      return sanitizeFileName(dispositionName);
    }

    const pathName = url.pathname.split("/").pop();
    if (pathName) {
      return sanitizeFileName(pathName);
    }
  } catch {
    // Fall through to default filename.
  }

  return `scopus-export-${Date.now()}.ris`;
}

function extractDispositionFileName(value: string): string | null {
  const starMatch = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (starMatch?.[1]) {
    return decodeURIComponent(starMatch[1]);
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(value);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const bareMatch = /filename=([^;]+)/i.exec(value);
  if (bareMatch?.[1]) {
    return bareMatch[1].trim();
  }

  return null;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
}

function normalizeNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseJson<T>(payload: string): T | null {
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}
