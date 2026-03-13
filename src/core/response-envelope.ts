import type { ProviderId, SessionPhase, ToolEnvelope } from "../adapters/provider-contract.js";
import { nowIso } from "../utils/time.js";

export interface EnvelopeContext {
  provider: ProviderId;
  sessionId: string;
  phase: SessionPhase;
  warnings?: string[];
  nextActions?: string[];
  raw?: unknown;
}

export function buildEnvelope<T>(data: T, context: EnvelopeContext): ToolEnvelope<T> {
  return {
    ok: true,
    provider: context.provider,
    sessionId: context.sessionId,
    phase: context.phase,
    timestamp: nowIso(),
    warnings: context.warnings,
    nextActions: context.nextActions,
    data,
    raw: context.raw,
  };
}

export function buildErrorEnvelope(message: string, context: EnvelopeContext): ToolEnvelope<{ error: string }> {
  return {
    ok: false,
    provider: context.provider,
    sessionId: context.sessionId,
    phase: context.phase,
    timestamp: nowIso(),
    warnings: context.warnings,
    nextActions: context.nextActions,
    data: {
      error: message,
    },
    raw: context.raw,
  };
}
