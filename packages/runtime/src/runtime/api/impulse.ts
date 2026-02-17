import { canonImpulseEntry, type ImpulseQEntryCanonical } from "../../canon/impulseEntry.js";
import { drain } from "../../processing/drain.js";
import type { RuntimeStore } from "../store.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";

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

        const result = drain({
          entries: store.impulseQ.q.entries,
          cursor: store.impulseQ.q.cursor,
          draining: store.draining,
          process: processImpulseEntry,
          onAbort: () => undefined,
        });

        store.draining = result.draining;
        if (!result.aborted) {
          store.impulseQ.q.cursor = result.cursor;
        }
      });
}