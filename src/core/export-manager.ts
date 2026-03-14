import fs from "node:fs/promises";
import path from "node:path";
import type { ExportRequest, ExportResult, SearchProviderAdapter } from "../adapters/provider-contract.js";
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
  ): Promise<ExportResult> {
    const session = await this.sessionManager.ensureRuntime(sessionId);
    const context = this.sessionManager.buildProviderContext(session);
    await this.sessionManager.setPhase(sessionId, "exporting");

    const result = await adapter.exportNative(context, request);

    await this.sessionManager.setPhase(sessionId, "completed");
    return result;
  }

  async convertExportToRis(filePath: string, format?: string): Promise<string> {
    return this.risConverter.convertFileToRis(filePath, format);
  }

  async copyToOutputDir(result: ExportResult, outputDir: string): Promise<ExportResult> {
    await fs.mkdir(outputDir, { recursive: true });

    let newPath: string | undefined;
    if (result.path) {
      const destPath = path.join(outputDir, path.basename(result.path));
      await fs.copyFile(result.path, destPath);
      newPath = destPath;
    }

    return { ...result, ...(newPath !== undefined && { path: newPath }) };
  }
}
