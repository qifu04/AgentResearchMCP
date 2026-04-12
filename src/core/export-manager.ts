import fs from "node:fs/promises";
import path from "node:path";
import type { ExportRequest, ExportResult, SearchProviderAdapter } from "../adapters/provider-contract.js";
import type { SessionManager } from "./session-manager.js";
import { RisConverter } from "./ris-converter.js";
import { ensureTimestampedFileName } from "../utils/fs.js";

export class ExportManager {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly risConverter: RisConverter = new RisConverter(),
  ) {}

  async exportWithAdapter(
    sessionId: string,
    adapter: SearchProviderAdapter,
    request: ExportRequest,
  ): Promise<ExportResult> {
    const session = await this.sessionManager.ensureRuntime(sessionId);
    const context = this.sessionManager.buildProviderContext(session);
    await this.sessionManager.setPhase(sessionId, "exporting");

    const result = await adapter.exportNative(context, request);
    const finalizedResult = await this.ensureTimestampedRisExport(result);

    await this.sessionManager.setPhase(sessionId, "completed");
    return finalizedResult;
  }

  async convertExportToRis(filePath: string, format?: string): Promise<string> {
    return this.risConverter.convertFileToRis(filePath, format);
  }

  async copyToOutputDir(result: ExportResult, outputDir: string): Promise<ExportResult> {
    await fs.mkdir(outputDir, { recursive: true });

    const fileName = this.resolveResultFileName(result);
    let newPath: string | undefined;
    if (result.path) {
      const destPath = path.join(outputDir, fileName);
      await fs.copyFile(result.path, destPath);
      newPath = destPath;
    }

    return {
      ...result,
      fileName,
      ...(newPath !== undefined && { path: newPath }),
    };
  }

  private async ensureTimestampedRisExport(result: ExportResult): Promise<ExportResult> {
    if (result.format !== "ris") {
      return result;
    }

    const fileName = this.resolveResultFileName(result);
    if (!result.path) {
      return { ...result, fileName };
    }

    const currentPath = result.path;
    const nextPath = path.join(path.dirname(currentPath), fileName);

    if (nextPath !== currentPath) {
      await fs.rename(currentPath, nextPath);
    }

    return {
      ...result,
      path: nextPath,
      fileName,
    };
  }

  private resolveResultFileName(result: ExportResult): string {
    const fileName = result.fileName ?? (result.path ? path.basename(result.path) : null);
    if (!fileName) {
      return `export-${Date.now()}.ris`;
    }

    return ensureTimestampedFileName(fileName);
  }
}
