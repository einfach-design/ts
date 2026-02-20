import type { ImpulseQEntryCanonical } from "../../canon/impulseEntry.js";
import { trim } from "../../processing/trim.js";
import {
  createBackfillQ,
  type BackfillQSnapshot,
} from "../../state/backfillQ.js";
import {
  setDefaults,
  type Defaults,
  type SetDefaults,
} from "../../state/defaults.js";
import {
  applyFlagDeltas,
  createFlagsView,
  extendSeenFlags,
  type FlagsView,
} from "../../state/flagsView.js";
import {
  signals as patchSignals,
  type SeenSignals,
} from "../../state/signals.js";
import { hasOwn, isObject, measureEntryBytes } from "../util.js";
import type {
  RuntimeOnError,
  RuntimeStore,
  ScopeProjectionBaseline,
} from "../store.js";
import type { RegistryStore } from "../../state/registry.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import type { RegisteredExpression } from "../../runs/coreRun.js";
import { snapshotGetKeys } from "./get.js";

const hydrationRequiredKeys = snapshotGetKeys;

const allowedPatchKeys = [
  "flags",
  "addFlags",
  "removeFlags",
  "signals",
  "defaults",
  "impulseQ",
] as const;

export function runSet(
  store: RuntimeStore,
  {
    expressionRegistry,
    diagnostics,
  }: {
    expressionRegistry: RegistryStore<RegisteredExpression>;
    diagnostics: DiagnosticCollector;
  },
  patch: Record<string, unknown>,
): void {
  store.withRuntimeStack(() => {
    if (!isObject(patch)) {
      const valueType = Array.isArray(patch)
        ? "array"
        : patch === null
          ? "null"
          : typeof patch;
      diagnostics.emit({
        code: "set.patch.invalid",
        message: "set patch must be an object.",
        severity: "error",
        data: { valueType },
      });
      throw new Error("set.patch.invalid");
    }

    const isHydration = hasOwn(patch, "backfillQ");

    if (isHydration) {
      for (const key of hydrationRequiredKeys) {
        if (!hasOwn(patch, key)) {
          diagnostics.emit({
            code: "set.hydration.incomplete",
            message: "Hydration patch is missing required keys.",
            severity: "error",
          });
          throw new Error("set.hydration.incomplete");
        }
      }

      const hydration = patch as {
        defaults: Defaults;
        flags: FlagsView;
        changedFlags?: FlagsView;
        seenFlags: FlagsView;
        signal?: string;
        seenSignals: SeenSignals;
        scopeProjectionBaseline?: ScopeProjectionBaseline;
        impulseQ: {
          q: { entries: ImpulseQEntryCanonical[]; cursor: number };
          config: {
            retain?: number | boolean;
            maxBytes?: number;
            onTrim?: (info: {
              entries: readonly ImpulseQEntryCanonical[];
              stats: { reason: "retain" | "maxBytes"; bytesFreed?: number };
            }) => void;
            onError?: RuntimeOnError;
          };
        };
        backfillQ: BackfillQSnapshot;
      };

      store.defaults = hydration.defaults;
      store.flagsTruth = hydration.flags;
      store.changedFlags = hydration.changedFlags;
      store.seenFlags = hydration.seenFlags;
      store.signal = hydration.signal;
      store.seenSignals = hydration.seenSignals;

      store.impulseQ.q.entries = hydration.impulseQ.q.entries;
      store.impulseQ.q.cursor = hydration.impulseQ.q.cursor;

      store.resetScopeProjectionBaseline();
      if (
        hasOwn(hydration, "scopeProjectionBaseline") &&
        hydration.scopeProjectionBaseline !== undefined
      ) {
        store.scopeProjectionBaseline = hydration.scopeProjectionBaseline;
      } else {
        store.scopeProjectionBaseline = {
          flags: hydration.flags,
          changedFlags: hydration.changedFlags,
          seenFlags: hydration.seenFlags,
          signal: hydration.signal,
          seenSignals: hydration.seenSignals,
        };
      }

      if (hasOwn(hydration.impulseQ.config, "retain")) {
        store.impulseQ.config.retain =
          hydration.impulseQ.config.retain === undefined
            ? 0
            : hydration.impulseQ.config.retain;
      } else {
        store.impulseQ.config.retain = 0;
      }

      if (hasOwn(hydration.impulseQ.config, "maxBytes")) {
        store.impulseQ.config.maxBytes = Number(
          hydration.impulseQ.config.maxBytes,
        );
      } else {
        store.impulseQ.config.maxBytes = Number.POSITIVE_INFINITY;
      }

      store.impulseQ.config.onTrim = hydration.impulseQ.config.onTrim;
      store.impulseQ.config.onError = hydration.impulseQ.config.onError;

      store.backfillQ = createBackfillQ();
      const hydrationBackfillIds = createFlagsView(
        hydration.backfillQ.list.filter(
          (id) => hydration.backfillQ.map[id] === true,
        ),
      ).list;

      for (const id of hydrationBackfillIds) {
        const expression = expressionRegistry.resolve(id);
        if (expression) {
          store.backfillQ.list.push(expression);
          store.backfillQ.map[id] = true;
          continue;
        }

        store.reportRuntimeError(
          new Error(`Hydration backfill id could not be resolved: ${id}`),
          "set/hydration/backfillQ",
          { regExpressionId: id },
        );
      }

      return;
    }

    for (const key of Object.keys(patch)) {
      if (!(allowedPatchKeys as readonly string[]).includes(key)) {
        diagnostics.emit({
          code: "set.patch.forbidden",
          message: "set patch contains forbidden keys.",
          severity: "error",
        });
        throw new Error("set.patch.forbidden");
      }
    }

    if (
      hasOwn(patch, "changedFlags") ||
      hasOwn(patch, "seenFlags") ||
      hasOwn(patch, "signal") ||
      hasOwn(patch, "seenSignals") ||
      hasOwn(patch, "backfillQ") ||
      hasOwn(patch, "registeredQ")
    ) {
      diagnostics.emit({
        code: "set.patch.forbidden",
        message: "set patch contains forbidden keys.",
        severity: "error",
      });
      throw new Error("set.patch.forbidden");
    }

    if (
      hasOwn(patch, "flags") &&
      (hasOwn(patch, "addFlags") || hasOwn(patch, "removeFlags"))
    ) {
      diagnostics.emit({
        code: "set.flags.addRemoveConflict",
        message: "flags and add/remove flags cannot be combined.",
        severity: "error",
      });
      throw new Error("set.flags.addRemoveConflict");
    }

    if (hasOwn(patch, "flags")) {
      const incoming = patch.flags;
      if (
        !isObject(incoming) ||
        !Array.isArray(incoming.list) ||
        !isObject(incoming.map)
      ) {
        const valueType = Array.isArray(incoming)
          ? "array"
          : incoming === null
            ? "null"
            : typeof incoming;
        diagnostics.emit({
          code: "set.flags.invalid",
          message:
            "flags patch must be an object with list(array) and map(object).",
          severity: "error",
          data: {
            valueType,
            hasList: isObject(incoming) ? Array.isArray(incoming.list) : false,
            hasMap: isObject(incoming) ? isObject(incoming.map) : false,
          },
        });
        throw new Error("set.flags.invalid");
      }
      const normalizedFlags = (incoming.list as string[]).map((flag) =>
        String(flag),
      );
      store.flagsTruth = createFlagsView(normalizedFlags);
      store.seenFlags = extendSeenFlags(store.seenFlags, normalizedFlags);
    }

    if (hasOwn(patch, "addFlags") || hasOwn(patch, "removeFlags")) {
      const addFlags = Array.isArray(patch.addFlags) ? patch.addFlags : [];
      const removeFlags = Array.isArray(patch.removeFlags)
        ? patch.removeFlags
        : [];

      const normalizedAddFlags = addFlags.map((flag) => String(flag));
      const normalizedRemoveFlags = removeFlags.map((flag) => String(flag));

      const overlap = new Set(
        normalizedAddFlags.filter((flag) =>
          normalizedRemoveFlags.includes(flag),
        ),
      );
      if (overlap.size > 0) {
        diagnostics.emit({
          code: "set.flags.addRemoveConflict",
          message: "addFlags and removeFlags cannot overlap.",
          severity: "error",
        });
        throw new Error("set.flags.addRemoveConflict");
      }

      store.flagsTruth = applyFlagDeltas(
        store.flagsTruth,
        normalizedAddFlags,
        normalizedRemoveFlags,
      );
      store.changedFlags = undefined;

      const seenInput = [...normalizedAddFlags, ...normalizedRemoveFlags];
      store.seenFlags = extendSeenFlags(store.seenFlags, seenInput);
    }

    if (hasOwn(patch, "signals")) {
      if (
        !Array.isArray(patch.signals) ||
        !patch.signals.every((signal) => typeof signal === "string")
      ) {
        diagnostics.emit({
          code: "set.signals.invalid",
          message: "signals patch must be an array of strings.",
          severity: "error",
        });
        throw new Error("set.signals.invalid");
      }

      const nextSignals = patchSignals({
        ...(store.signal !== undefined ? { previousSignal: store.signal } : {}),
        previousSeenSignals: store.seenSignals,
        signals: patch.signals,
      });

      store.signal = nextSignals.signal;
      store.seenSignals = nextSignals.seenSignals;
    }

    if (hasOwn(patch, "defaults")) {
      store.defaults = setDefaults(
        store.defaults,
        patch.defaults as SetDefaults,
      );
    }

    if (hasOwn(patch, "impulseQ")) {
      const impulsePatch = patch.impulseQ;
      if (!isObject(impulsePatch)) {
        const valueType = Array.isArray(impulsePatch)
          ? "array"
          : impulsePatch === null
            ? "null"
            : typeof impulsePatch;
        diagnostics.emit({
          code: "set.impulseQ.invalid",
          message: "impulseQ patch must be an object.",
          severity: "error",
          data: { valueType },
        });
        throw new Error("set.impulseQ.invalid");
      }

      if (hasOwn(impulsePatch, "q")) {
        diagnostics.emit({
          code: "set.impulseQ.qForbidden",
          message: "impulseQ.q cannot be patched via set().",
          severity: "error",
          data: { field: "q" },
        });
        throw new Error("set.impulseQ.qForbidden");
      }

      if (isObject(impulsePatch.config)) {
        if (hasOwn(impulsePatch.config, "retain")) {
          store.impulseQ.config.retain = impulsePatch.config.retain as
            | number
            | boolean;
        }
        if (hasOwn(impulsePatch.config, "maxBytes")) {
          store.impulseQ.config.maxBytes = Number(impulsePatch.config.maxBytes);
        }
        if (hasOwn(impulsePatch.config, "onTrim")) {
          store.impulseQ.config.onTrim = impulsePatch.config.onTrim as
            | ((info: {
                entries: readonly ImpulseQEntryCanonical[];
                stats: { reason: "retain" | "maxBytes"; bytesFreed?: number };
              }) => void)
            | undefined;
        }
        if (hasOwn(impulsePatch.config, "onError")) {
          store.impulseQ.config.onError = impulsePatch.config.onError as
            | RuntimeOnError
            | undefined;
        }

        const prevEntries = store.impulseQ.q.entries;
        const prevCursor = store.impulseQ.q.cursor;

        const trimmed = trim({
          entries: prevEntries,
          cursor: prevCursor,
          retain: store.impulseQ.config.retain,
          maxBytes: store.impulseQ.config.maxBytes,
          runtimeStackActive: store.runtimeStackDepth > 0,
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
      }
    }
  });
}
