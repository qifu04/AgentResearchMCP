import path from "node:path";
import type { ProviderId } from "../adapters/provider-contract.js";
import { ensureDir } from "../utils/fs.js";

/**
 * Manages persistent browser profile directories and ensures
 * only one active runtime uses a given profile at a time.
 */
export class PersistentProfileStore {
  /** profileDir → sessionId that currently holds the lock */
  private readonly activeLocks = new Map<string, string>();

  constructor(private readonly authRootDir: string) {}

  getProfileDir(provider: ProviderId, profileKey?: string | null): string {
    const normalizedKey = profileKey?.trim() ? profileKey.trim() : "default";
    return path.join(this.authRootDir, provider, normalizedKey, "profile");
  }

  async ensureProfileDir(provider: ProviderId, profileKey?: string | null): Promise<string> {
    return ensureDir(this.getProfileDir(provider, profileKey));
  }

  /**
   * Acquire an exclusive lock on a profile directory for a session.
   * Throws if another session already holds the lock.
   */
  acquireProfileLock(provider: ProviderId, profileKey: string | null | undefined, sessionId: string): void {
    const dir = this.getProfileDir(provider, profileKey);
    const holder = this.activeLocks.get(dir);
    if (holder && holder !== sessionId) {
      throw new Error(
        `Profile "${provider}/${profileKey ?? "default"}" is already in use by session ${holder}. ` +
        `Close that session first or use a different profileKey.`
      );
    }
    this.activeLocks.set(dir, sessionId);
  }

  /**
   * Release the profile lock held by a session.
   */
  releaseProfileLock(provider: ProviderId, profileKey: string | null | undefined, sessionId: string): void {
    const dir = this.getProfileDir(provider, profileKey);
    const holder = this.activeLocks.get(dir);
    if (holder === sessionId) {
      this.activeLocks.delete(dir);
    }
  }
}
