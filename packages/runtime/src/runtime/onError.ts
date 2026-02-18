import type { RuntimeOnError } from "./store.js";

export interface RuntimeOnErrorIssue {
  readonly error: unknown;
  readonly code: string;
  readonly phase: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

export function applyRuntimeOnError(
  mode: RuntimeOnError | undefined,
  issue: RuntimeOnErrorIssue,
  report: (issue: RuntimeOnErrorIssue) => void,
): void {
  if (typeof mode === "function") {
    mode(issue.error);
    return;
  }

  if (mode === "swallow") {
    return;
  }

  if (mode === "throw") {
    throw issue.error;
  }

  report(issue);
}
