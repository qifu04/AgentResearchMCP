import type { LoginState, SearchProviderAdapter } from "../adapters/provider-contract.js";
import { waitForDocumentReady } from "../browser/page-helpers.js";
import type { SessionManager } from "./session-manager.js";
import { sleep } from "../utils/time.js";

export interface WaitForLoginOptions {
  capability?: "search" | "export" | "personal";
  timeoutMs?: number;
  pollMs?: number;
}

export class LoginOrchestrator {
  constructor(private readonly sessionManager: SessionManager) {}

  async waitForLoginTransition(
    sessionId: string,
    adapter: SearchProviderAdapter,
    options: WaitForLoginOptions = {},
  ): Promise<LoginState> {
    const capability = options.capability ?? "export";
    const timeoutMs = options.timeoutMs ?? 5 * 60_000;
    const pollMs = options.pollMs ?? 1_500;
    const startedAt = Date.now();

    await this.sessionManager.setPhase(sessionId, "awaiting_user_login");

    while (Date.now() - startedAt < timeoutMs) {
      const session = await this.sessionManager.ensureRuntime(sessionId);
      const context = this.sessionManager.buildProviderContext(session);
      await waitForDocumentReady(context.page);
      const loginState = await adapter.detectLoginState(context);
      if (isCapabilitySatisfied(loginState, capability)) {
        await this.sessionManager.setPhase(sessionId, "search_ready");
        return loginState;
      }
      await sleep(pollMs);
    }

    throw new Error(`Timed out waiting for ${capability} login state.`);
  }
}

function isCapabilitySatisfied(loginState: LoginState, capability: "search" | "export" | "personal"): boolean {
  switch (capability) {
    case "search":
      return loginState.canSearch;
    case "export":
      return loginState.canExport;
    case "personal":
      return loginState.kind === "personal";
    default:
      return false;
  }
}
