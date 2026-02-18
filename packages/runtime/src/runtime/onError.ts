import type { DiagnosticCollector } from "../diagnostics/index.js";
import type { RuntimeOnError } from "./store.js";

export type RuntimeErrorPhase =
  | "impulse/drain"
  | "diagnostic/listener"
  | "trim/onTrim";

export function handleRuntimeOnError(
  mode: RuntimeOnError | undefined,
  diagnostics: DiagnosticCollector,
  error: unknown,
  phase: RuntimeErrorPhase,
  extraData?: Record<string, unknown>,
): void {
  if (typeof mode === "function") {
    mode(error);
    return;
  }

  if (mode === "swallow") {
    return;
  }

  if (mode === "throw") {
    throw error;
  }

  diagnostics.emit({
    code: "runtime.onError.report",
    message: error instanceof Error ? error.message : "Runtime onError report",
    severity: "error",
    data: {
      phase,
      ...(extraData ?? {}),
    },
  });
}
