import { describe, expect, it } from "vitest";
import { SessionLock } from "../src/core/session-lock.js";

describe("SessionLock", () => {
  it("acquires and releases locks for the same owner", async () => {
    const lock = new SessionLock();
    lock.acquire("session-1", "owner-1");
    expect(lock.getOwner("session-1")).toBe("owner-1");
    lock.release("session-1", "owner-1");
    expect(lock.getOwner("session-1")).toBeNull();
  });

  it("rejects competing owners", async () => {
    const lock = new SessionLock();
    lock.acquire("session-1", "owner-1");
    expect(() => lock.acquire("session-1", "owner-2")).toThrow(/already locked/i);
  });

  it("runs tasks exclusively", async () => {
    const lock = new SessionLock();
    const value = await lock.runExclusive("session-1", "owner-1", async () => "done");
    expect(value).toBe("done");
    expect(lock.getOwner("session-1")).toBeNull();
  });
});
