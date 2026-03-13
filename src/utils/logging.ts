export interface Logger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

function format(message: string, details?: unknown): string {
  if (details === undefined) {
    return message;
  }

  return `${message} ${JSON.stringify(details)}`;
}

export const logger: Logger = {
  info(message, details) {
    console.error(`[info] ${format(message, details)}`);
  },
  warn(message, details) {
    console.error(`[warn] ${format(message, details)}`);
  },
  error(message, details) {
    console.error(`[error] ${format(message, details)}`);
  },
};
