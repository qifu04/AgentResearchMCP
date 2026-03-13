import path from "node:path";
import type { ProviderId } from "../adapters/provider-contract.js";
import { ensureDir } from "../utils/fs.js";

export class PersistentProfileStore {
  constructor(private readonly authRootDir: string) {}

  getProfileDir(provider: ProviderId, profileKey?: string | null): string {
    const normalizedKey = profileKey?.trim() ? profileKey.trim() : "default";
    return path.join(this.authRootDir, provider, normalizedKey, "profile");
  }

  async ensureProfileDir(provider: ProviderId, profileKey?: string | null): Promise<string> {
    return ensureDir(this.getProfileDir(provider, profileKey));
  }
}
