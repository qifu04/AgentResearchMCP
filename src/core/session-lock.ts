export class SessionLock {
  private readonly owners = new Map<string, string>();

  acquire(sessionId: string, ownerId: string): void {
    const currentOwner = this.owners.get(sessionId);
    if (currentOwner && currentOwner !== ownerId) {
      throw new Error(`Session ${sessionId} is already locked by ${currentOwner}.`);
    }
    this.owners.set(sessionId, ownerId);
  }

  release(sessionId: string, ownerId: string): void {
    const currentOwner = this.owners.get(sessionId);
    if (!currentOwner) {
      return;
    }
    if (currentOwner !== ownerId) {
      throw new Error(`Session ${sessionId} is locked by ${currentOwner}, not ${ownerId}.`);
    }
    this.owners.delete(sessionId);
  }

  getOwner(sessionId: string): string | null {
    return this.owners.get(sessionId) ?? null;
  }

  async runExclusive<T>(sessionId: string, ownerId: string, task: () => Promise<T>): Promise<T> {
    this.acquire(sessionId, ownerId);
    try {
      return await task();
    } finally {
      this.release(sessionId, ownerId);
    }
  }
}
