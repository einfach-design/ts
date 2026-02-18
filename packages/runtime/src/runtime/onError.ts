import type { DiagnosticCollector } from "../diagnostics/index.js";
import type { RuntimeOnError } from "./store.js";

export type RuntimeErrorPhase =
  | "impulse/drain"
  | "diagnostic/listener"
  | "trim/onTrim"
  | "target/callback"
  | "target/object";

export function handleRuntimeOnError(
  mode: RuntimeOnError | undefined,
  diagnostics: DiagnosticCollector,
  error: unknown,
  phase: RuntimeErrorPhase,
  extraData?: Record<string, unknown>,
): void {
  diagnostics.emit({
    code:
      phase === "target/callback" || phase === "target/object"
        ? "runtime.target.error"
        : "runtime.onError.report",
    message: error instanceof Error ? error.message : "Runtime onError report",
    severity: "error",
    data: {
      phase,
      ...(extraData ?? {}),
    },
  });

  if (typeof mode === "function") {
    mode(error);
    return;
  }

  if (mode === "throw") {
    throw error;
  }
}
