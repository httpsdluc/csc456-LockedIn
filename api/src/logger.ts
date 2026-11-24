// One JSON object per line so Render's log search can filter on requestId or status.
export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  msg: string;
  [field: string]: unknown;
}

export type Logger = (entry: LogEntry) => void;

export function createJsonLogger(
  out: (line: string) => void = (line) => process.stdout.write(line + "\n"),
  err: (line: string) => void = (line) => process.stderr.write(line + "\n"),
  now: () => Date = () => new Date(),
): Logger {
  return (entry) => {
    const line = JSON.stringify({ time: now().toISOString(), ...entry });
    (entry.level === "info" ? out : err)(line);
  };
}

// Error's fields aren't enumerable, so JSON.stringify(err) gives {}.
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}
