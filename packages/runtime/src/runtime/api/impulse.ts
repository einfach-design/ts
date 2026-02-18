import {
  canonImpulseEntry,
  type ImpulseQEntryCanonical,
} from "../../canon/impulseEntry.js";
import { drain } from "../../processing/drain.js";
import { isInnerExpressionAbort } from "../../runs/coreRun.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import type { RuntimeStore } from "../store.js";

function handleOuterError(
  diagnostics: DiagnosticCollector,
  mode: RuntimeStore["impulseQ"]["config"]["onError"],
  error: unknown,
  phase: "impulse/canon" | "impulse/drain",
  reportInvalidInput = false,
): void {
  if (reportInvalidInput) {
    diagnostics.emit({
      code: "impulse.input.invalid",
      message: "Invalid impulse payload.",
      severity: "error",
      data: { phase },
    });
  } else if (mode === "report") {
    diagnostics.emit({
      code: "runtime.onError.report",
      message: error instanceof Error ? error.message : "Runtime error",
      severity: "error",
      data: { phase },
    });
  }

  if (typeof mode === "function") {
    mode(error);
    return;
  }

  if (mode === "throw") {
    throw error;
  }
}

export function runImpulse(
  store: RuntimeStore,
  {
    diagnostics,
    processImpulseEntry,
  }: {
    diagnostics: DiagnosticCollector;
    processImpulseEntry: (entry: ImpulseQEntryCanonical) => void;
  },
  opts?: unknown,
): void {
  store.withRuntimeStack(() => {
    const canonical = canonImpulseEntry(opts);
    const mode = canonical.onError ?? store.impulseQ.config.onError ?? "report";

    if (canonical.entry === undefined) {
      handleOuterError(
        diagnostics,
        mode,
        new Error("impulse.input.invalid"),
        "impulse/canon",
        mode === "report",
      );
      return;
    }

    store.impulseQ.q.entries.push(canonical.entry);

    if (store.draining) {
      return;
    }

    store.activeOuterOnError = canonical.onError;
    store.draining = true;

    try {
      const result = drain({
        entries: store.impulseQ.q.entries,
        cursor: store.impulseQ.q.cursor,
        draining: false,
        process: processImpulseEntry,
        onAbort: (info) => {
          throw info.error;
        },
      });

      if (!result.aborted) {
        store.impulseQ.q.cursor = result.cursor;
      }
    } catch (error) {
      if (isInnerExpressionAbort(error)) {
        throw error.error;
      }

      handleOuterError(
        diagnostics,
        mode,
        error,
        "impulse/drain",
        mode === "report",
      );
    } finally {
      store.draining = false;
      store.activeOuterOnError = undefined;
    }
  });
}
