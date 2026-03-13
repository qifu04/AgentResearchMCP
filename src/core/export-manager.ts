import path from "node:path";
import type { ExportCapability, ExportRequest, ExportResult, SearchProviderAdapter, SearchSummary } from "../adapters/provider-contract.js";
import type { SessionManager } from "./session-manager.js";
import { RisConverter } from "./ris-converter.js";

export class ExportManager {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly risConverter: RisConverter = new RisConverter(),
  ) {}

  async exportWithAdapter(
    sessionId: string,
    adapter: SearchProviderAdapter,
    request: ExportRequest,
    capability: ExportCapability,
    summary?: SearchSummary,
  ): Promise<ExportResult> {
    const session = await this.sessionManager.ensureRuntime(sessionId);
    const context = this.sessionManager.buildProviderContext(session);
    await this.sessionManager.setPhase(sessionId, "exporting");

    const chunks = planExportChunks(request, capability, summary);
    const results: ExportResult[] = [];

    for (const chunk of chunks) {
      const result = await adapter.exportNative(context, chunk);
      results.push(result);
    }

    await this.sessionManager.setPhase(sessionId, "completed");

    if (results.length === 1) {
      return results[0];
    }

    const chunkPaths = results.map((result) => result.path).filter((value): value is string => Boolean(value));
    const mergedPath =
      chunkPaths.length > 0 && results.every((result) => result.format === "ris")
        ? await this.risConverter.mergeRisFiles(
            chunkPaths,
            path.join(session.paths.exportsDir, `merged-${Date.now()}.ris`),
          )
        : undefined;

    return {
      provider: session.record.provider,
      format: results[0]?.format ?? "unknown",
      path: mergedPath,
      chunks: chunkPaths,
      raw: results.map((result) => result.raw),
    };
  }

  async convertExportToRis(filePath: string, format?: string): Promise<string> {
    return this.risConverter.convertFileToRis(filePath, format);
  }
}

export function planExportChunks(
  request: ExportRequest,
  capability: ExportCapability,
  summary?: SearchSummary,
): ExportRequest[] {
  if (!capability.maxBatch || request.scope !== "range") {
    if (request.scope === "all" && capability.maxBatch && summary?.totalResults) {
      return buildRangeChunks(1, summary.totalResults, capability.maxBatch, request);
    }
    return [request];
  }

  const start = request.start ?? 1;
  const end = request.end ?? start;
  return buildRangeChunks(start, end, capability.maxBatch, request);
}

function buildRangeChunks(
  start: number,
  end: number,
  maxBatch: number,
  request: ExportRequest,
): ExportRequest[] {
  const chunks: ExportRequest[] = [];
  for (let chunkStart = start; chunkStart <= end; chunkStart += maxBatch) {
    const chunkEnd = Math.min(end, chunkStart + maxBatch - 1);
    chunks.push({
      ...request,
      scope: "range",
      start: chunkStart,
      end: chunkEnd,
    });
  }
  return chunks;
}
