import {
  canonImpulseEntry,
  type ImpulseQEntryCanonical,
} from "../../canon/impulseEntry.js";
import { drain } from "../../processing/drain.js";
import { trim } from "../../processing/trim.js";
import { isInnerExpressionAbort } from "../../runs/coreRun.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import { createFlagsView } from "../../state/flagsView.js";
import { measureEntryBytes } from "../util.js";
import type { RuntimeStore } from "../store.js";

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
    let canonical: ReturnType<typeof canonImpulseEntry> | undefined;

    try {
      canonical = canonImpulseEntry(opts);
    } catch {
      const mode = store.impulseQ.config.onError ?? "report";
      const error = new Error("impulse.input.invalid");

      if (mode === "report") {
        diagnostics.emit({
          code: "impulse.input.invalid",
          message: "Invalid impulse payload.",
          severity: "error",
          data: { phase: "impulse/canon" },
        });
        return;
      }

      if (mode === "swallow") {
        return;
      }

      if (mode === "throw") {
        throw error;
      }

      mode(error, { phase: "impulse/canon" });
      return;
    }

    const mode = canonical.onError ?? store.impulseQ.config.onError ?? "report";

    if (canonical.entry === undefined) {
      const error = new Error("impulse.input.invalid");

      if (mode === "report") {
        diagnostics.emit({
          code: "impulse.input.invalid",
          message: "Invalid impulse payload.",
          severity: "error",
          data: { phase: "impulse/canon" },
        });
        return;
      }

      if (mode === "swallow") {
        return;
      }

      if (mode === "throw") {
        throw error;
      }

      mode(error, { phase: "impulse/canon" });
      return;
    }

    const storedEntry: ImpulseQEntryCanonical = {
      ...(canonical.entry.onError !== undefined
        ? { onError: canonical.entry.onError }
        : {}),
      signals: [...canonical.entry.signals],
      addFlags: [...canonical.entry.addFlags],
      removeFlags: [...canonical.entry.removeFlags],
      useFixedFlags:
        canonical.entry.useFixedFlags === false
          ? false
          : createFlagsView([...canonical.entry.useFixedFlags.list]),
      ...(Object.prototype.hasOwnProperty.call(canonical.entry, "livePayload")
        ? { livePayload: canonical.entry.livePayload }
        : {}),
    };

    store.impulseQ.q.entries.push(storedEntry);

    if (store.draining) {
      return;
    }

    store.draining = true;

    try {
      while (store.impulseQ.q.cursor < store.impulseQ.q.entries.length) {
        const cursor = store.impulseQ.q.cursor;
        const entryAtCursor = store.impulseQ.q.entries[cursor] as
          | ImpulseQEntryCanonical
          | undefined;
        const entryMode =
          entryAtCursor?.onError ?? store.impulseQ.config.onError ?? "report";
        let abortError: unknown;

        store.activeOuterOnError = entryAtCursor?.onError;

        const result = drain({
          entries: store.impulseQ.q.entries.slice(0, cursor + 1),
          cursor,
          draining: false,
          process: (entry) => {
            const previousOuterOnError = store.activeOuterOnError;
            store.activeOuterOnError = entry.onError;

            try {
              processImpulseEntry(entry);
            } finally {
              store.activeOuterOnError = previousOuterOnError;
            }
          },
          onAbort: ({ error }) => {
            abortError = error;
          },
        });

        store.impulseQ.q.cursor = result.cursor;

        if (result.aborted) {
          if (isInnerExpressionAbort(abortError)) {
            throw abortError.error;
          }

          store.reportRuntimeError(
            abortError,
            "impulse/drain",
            undefined,
            entryMode,
          );
          break;
        }
      }

      const prevEntries = store.impulseQ.q.entries;
      const prevCursor = store.impulseQ.q.cursor;

      const trimmed = trim({
        entries: prevEntries,
        cursor: prevCursor,
        retain: store.impulseQ.config.retain,
        maxBytes: store.impulseQ.config.maxBytes,
        runtimeStackActive: true,
        trimPendingMaxBytes: store.trimPendingMaxBytes,
        measureBytes: measureEntryBytes,
        ...(store.impulseQ.config.onTrim !== undefined
          ? { onTrim: store.impulseQ.config.onTrim }
          : {}),
      });

      if (trimmed.onTrimError !== undefined) {
        store.reportRuntimeError(trimmed.onTrimError, "trim/onTrim");
      }

      const removedCount = Math.max(0, prevCursor - trimmed.cursor);
      if (removedCount > 0) {
        store.applyTrimmedAppliedEntriesToScopeBaseline(
          prevEntries.slice(0, removedCount),
        );
      }

      store.impulseQ.q.entries = [...trimmed.entries];
      store.impulseQ.q.cursor = trimmed.cursor;
      store.trimPendingMaxBytes = trimmed.trimPendingMaxBytes;
    } finally {
      store.draining = false;
      store.activeOuterOnError = undefined;
    }
  });
}
