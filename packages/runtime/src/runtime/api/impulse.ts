import {
  canonImpulseEntry,
  type ImpulseQEntryCanonical,
} from "../../canon/impulseEntry.js";
import { drain } from "../../processing/drain.js";
import type { RuntimeStore } from "../store.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import { applyRuntimeOnError } from "../onError.js";

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
          applyRuntimeOnError(
            store.onError,
            {
              error: info.error,
              code: "runtime.onError.report",
              phase: "impulse/drain",
              message:
                info.error instanceof Error
                  ? info.error.message
                  : "Runtime onError report",
            },
            (issue) => {
              diagnostics.emit({
                code: issue.code,
                message: issue.message,
                severity: "error",
                data: { phase: issue.phase },
              });
            },
          );
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
