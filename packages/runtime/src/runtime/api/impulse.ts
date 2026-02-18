import {
  canonImpulseEntry,
  type ImpulseQEntryCanonical,
} from "../../canon/impulseEntry.js";
import { drain } from "../../processing/drain.js";
import type { RuntimeOnError, RuntimeStore } from "../store.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";

function handleOnError(
  mode: RuntimeOnError | undefined,
  diagnostics: DiagnosticCollector,
  error: unknown,
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
    data: { phase: "impulse/drain" },
  });
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
    const entry = canonImpulseEntry(opts);
    if (entry === undefined) {
      diagnostics.emit({
        code: "impulse.input.invalid",
        message: "Invalid impulse payload.",
        severity: "error",
      });
      return;
    }

    store.impulseQ.q.entries.push(entry);

    if (store.draining) {
      return;
    }

    store.draining = true;

    try {
      const result = drain({
        entries: store.impulseQ.q.entries,
        cursor: store.impulseQ.q.cursor,
        draining: false,
        process: processImpulseEntry,
        onAbort: (info) => {
          handleOnError(store.impulseQ.config.onError, diagnostics, info.error);
        },
      });

      if (!result.aborted) {
        store.impulseQ.q.cursor = result.cursor;
      }
    } finally {
      store.draining = false;
    }
  });
}
