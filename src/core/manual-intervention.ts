export interface ManualInterventionContext {
  provider?: string;
  blockerType?: "dialog" | "cookie" | "captcha" | "unknown";
  selectors?: string[];
  instructions?: string[];
}

export class ManualInterventionRequiredError extends Error {
  readonly provider?: string;
  readonly blockerType: ManualInterventionContext["blockerType"];
  readonly selectors: string[];
  readonly instructions: string[];

  constructor(message: string, context: ManualInterventionContext = {}) {
    super(message);
    this.name = "ManualInterventionRequiredError";
    this.provider = context.provider;
    this.blockerType = context.blockerType ?? "unknown";
    this.selectors = context.selectors ?? [];
    this.instructions = context.instructions ?? [];
  }
}

export function isManualInterventionRequiredError(error: unknown): error is ManualInterventionRequiredError {
  return error instanceof ManualInterventionRequiredError;
}
