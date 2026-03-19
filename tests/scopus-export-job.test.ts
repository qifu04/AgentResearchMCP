import { describe, expect, it } from "vitest";
import {
  deriveScopusExportFileName,
  findScopusBulkJob,
  parseScopusBulkExportId,
  parseScopusPresignedUrl,
} from "../src/adapters/scopus/export-job.js";

describe("scopus export job helpers", () => {
  it("parses the bulk export id from the initiate response", () => {
    expect(parseScopusBulkExportId('{"bulkExportId":"abc-123"}')).toBe("abc-123");
  });

  it("finds the requested bulk job from the jobs payload", () => {
    expect(
      findScopusBulkJob(
        JSON.stringify({
          jobs: [
            { jobId: "other", status: "COMPLETED" },
            { jobId: "abc-123", status: "PROCESSING", fileUrl: "export_abc-123.ris" },
          ],
        }),
        "abc-123",
      ),
    ).toEqual({
      jobId: "abc-123",
      status: "PROCESSING",
      fileUrl: "export_abc-123.ris",
    });
  });

  it("parses the presigned download url", () => {
    expect(parseScopusPresignedUrl('{"presignedUrl":"https://example.com/export.ris"}')).toBe(
      "https://example.com/export.ris",
    );
  });

  it("derives the file name from the fallback fileUrl first", () => {
    expect(
      deriveScopusExportFileName(
        "https://example.com/export.ris?response-content-disposition=attachment%3B%20filename%3D%22ignored.ris%22",
        "export_from_job.ris",
      ),
    ).toBe("export_from_job.ris");
  });

  it("derives the file name from the presigned url disposition when needed", () => {
    expect(
      deriveScopusExportFileName(
        "https://example.com/export.ris?response-content-disposition=attachment%3B%20filename%3D%22export_real.ris%22",
      ),
    ).toBe("export_real.ris");
  });
});
