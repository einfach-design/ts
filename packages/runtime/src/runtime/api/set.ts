import {
  canonImpulseEntry,
  type ImpulseQEntryCanonical,
} from "../../canon/impulseEntry.js";
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
import { hasOwn, measureEntryBytes } from "../util.js";
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

const toValueType = (value: unknown): string =>
  Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Array.isArray(value) === false;

const throwSetDefaultsInvalid = (
  diagnostics: DiagnosticCollector,
  field: string,
  value: unknown,
): never => {
  diagnostics.emit({
    code: "set.defaults.invalid",
    message: "defaults payload must follow SetDefaults/Defaults shape.",
    severity: "error",
    data: {
      field,
      valueType: toValueType(value),
    },
  });
  throw new Error("set.defaults.invalid");
};

const assertForceTrueOrUndefined = (
  diagnostics: DiagnosticCollector,
  path: string,
  value: unknown,
): void => {
  if (value !== undefined && value !== true) {
    throwSetDefaultsInvalid(diagnostics, path, value);
  }
};

const assertValidDefaultsDimension = (
  diagnostics: DiagnosticCollector,
  dimension: unknown,
  path: string,
  valueType: "string" | "boolean",
): void => {
  if (!isRecordObject(dimension)) {
    throwSetDefaultsInvalid(diagnostics, path, dimension);
  }

  const dimensionRecord = dimension as Record<string, unknown>;

  if (!hasOwn(dimensionRecord, "value")) {
    throwSetDefaultsInvalid(diagnostics, `${path}.value`, undefined);
  }

  if (typeof dimensionRecord.value !== valueType) {
    throwSetDefaultsInvalid(
      diagnostics,
      `${path}.value`,
      dimensionRecord.value,
    );
  }

  if (hasOwn(dimensionRecord, "force")) {
    assertForceTrueOrUndefined(
      diagnostics,
      `${path}.force`,
      dimensionRecord.force,
    );
  }
};

const assertValidDefaultsSnapshot = (
  diagnostics: DiagnosticCollector,
  defaults: unknown,
): void => {
  if (!isRecordObject(defaults)) {
    throwSetDefaultsInvalid(diagnostics, "defaults", defaults);
  }

  const defaultsRecord = defaults as Record<string, unknown>;

  if (!isRecordObject(defaultsRecord.scope)) {
    throwSetDefaultsInvalid(
      diagnostics,
      "defaults.scope",
      defaultsRecord.scope,
    );
  }

  const scope = defaultsRecord.scope as Record<string, unknown>;
  assertValidDefaultsDimension(
    diagnostics,
    scope.signal,
    "defaults.scope.signal",
    "string",
  );
  assertValidDefaultsDimension(
    diagnostics,
    scope.flags,
    "defaults.scope.flags",
    "string",
  );

  if (!isRecordObject(defaultsRecord.gate)) {
    throwSetDefaultsInvalid(diagnostics, "defaults.gate", defaultsRecord.gate);
  }

  const gate = defaultsRecord.gate as Record<string, unknown>;
  assertValidDefaultsDimension(
    diagnostics,
    gate.signal,
    "defaults.gate.signal",
    "boolean",
  );
  assertValidDefaultsDimension(
    diagnostics,
    gate.flags,
    "defaults.gate.flags",
    "boolean",
  );
};

const canonicalRetainForSet = (
  diagnostics: DiagnosticCollector,
  retain: unknown,
): number | boolean => {
  if (retain === undefined) {
    return 0;
  }

  if (typeof retain === "boolean") {
    return retain;
  }

  if (typeof retain === "number") {
    if (Number.isNaN(retain)) {
      diagnostics.emit({
        code: "set.impulseQ.retainInvalid",
        message:
          "impulseQ.config.retain must be a boolean or a non-NaN number.",
        severity: "error",
        data: {
          field: "retain",
          valueType: toValueType(retain),
        },
      });
      throw new Error("set.impulseQ.retainInvalid");
    }

    return Math.max(0, retain);
  }

  diagnostics.emit({
    code: "set.impulseQ.retainInvalid",
    message: "impulseQ.config.retain must be a boolean or a non-NaN number.",
    severity: "error",
    data: {
      field: "retain",
      valueType: toValueType(retain),
    },
  });
  throw new Error("set.impulseQ.retainInvalid");
};

const canonicalMaxBytesForSet = (
  diagnostics: DiagnosticCollector,
  maxBytes: unknown,
): number => {
  if (maxBytes === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (typeof maxBytes === "number") {
    if (Number.isNaN(maxBytes)) {
      diagnostics.emit({
        code: "set.impulseQ.maxBytesInvalid",
        message: "impulseQ.config.maxBytes must be a non-NaN number.",
        severity: "error",
        data: {
          field: "maxBytes",
          valueType: toValueType(maxBytes),
        },
      });
      throw new Error("set.impulseQ.maxBytesInvalid");
    }

    return Math.max(0, maxBytes);
  }

  diagnostics.emit({
    code: "set.impulseQ.maxBytesInvalid",
    message: "impulseQ.config.maxBytes must be a non-NaN number.",
    severity: "error",
    data: {
      field: "maxBytes",
      valueType: toValueType(maxBytes),
    },
  });
  throw new Error("set.impulseQ.maxBytesInvalid");
};

const canonicalOnTrimForSet = (
  diagnostics: DiagnosticCollector,
  onTrim: unknown,
): RuntimeStore["impulseQ"]["config"]["onTrim"] => {
  if (onTrim === undefined) {
    return undefined;
  }

  if (typeof onTrim === "function") {
    return onTrim as RuntimeStore["impulseQ"]["config"]["onTrim"];
  }

  diagnostics.emit({
    code: "set.impulseQ.onTrimInvalid",
    message: "impulseQ.config.onTrim must be undefined or a function.",
    severity: "error",
    data: {
      field: "onTrim",
      valueType: toValueType(onTrim),
    },
  });
  throw new Error("set.impulseQ.onTrimInvalid");
};

const canonicalOnErrorForSet = (
  diagnostics: DiagnosticCollector,
  onError: unknown,
): RuntimeStore["impulseQ"]["config"]["onError"] => {
  if (onError === undefined) {
    return undefined;
  }

  if (typeof onError === "function") {
    return onError as RuntimeOnError;
  }

  if (onError === "throw" || onError === "report" || onError === "swallow") {
    return onError;
  }

  diagnostics.emit({
    code: "set.impulseQ.onErrorInvalid",
    message:
      'impulseQ.config.onError must be undefined, a function, or "throw"|"report"|"swallow".',
    severity: "error",
    data: {
      field: "onError",
      valueType: toValueType(onError),
    },
  });
  throw new Error("set.impulseQ.onErrorInvalid");
};

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
  const readFlagDelta = (
    field: "addFlags" | "removeFlags",
    value: unknown,
  ): string[] => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry));
    }

    if (isRecordObject(value)) {
      if (
        hasOwn(value, "list") &&
        Array.isArray(value.list) &&
        hasOwn(value, "map") &&
        isRecordObject(value.map)
      ) {
        return (value.list as unknown[]).map((entry) => String(entry));
      }
    }

    diagnostics.emit({
      code: "set.flags.deltaInvalid",
      message:
        "addFlags/removeFlags must be an array of strings or a FlagsView ({ list, map }).",
      severity: "error",
      data: {
        field,
        valueType: toValueType(value),
      },
    });
    throw new Error("set.flags.deltaInvalid");
  };

  store.withRuntimeStack(() => {
    if (!isRecordObject(patch)) {
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

      const isPristineHydrationTarget =
        store.impulseQ.q.entries.length === 0 &&
        store.impulseQ.q.cursor === 0 &&
        store.flagsTruth.list.length === 0 &&
        store.seenFlags.list.length === 0 &&
        store.signal === undefined &&
        store.seenSignals.list.length === 0;

      assertValidDefaultsSnapshot(diagnostics, hydration.defaults);
      store.defaults = hydration.defaults;
      store.flagsTruth = hydration.flags;
      store.changedFlags = hydration.changedFlags;
      store.seenFlags = hydration.seenFlags;
      store.signal = hydration.signal;
      store.seenSignals = hydration.seenSignals;

      if (!isRecordObject(hydration.impulseQ)) {
        diagnostics.emit({
          code: "set.impulseQ.invalid",
          message: "impulseQ value must be an object.",
          severity: "error",
          data: {
            valueType: toValueType(hydration.impulseQ),
          },
        });
        throw new Error("set.impulseQ.invalid");
      }

      if (!isRecordObject(hydration.impulseQ.q)) {
        diagnostics.emit({
          code: "set.impulseQ.qInvalid",
          message: "impulseQ.q must be an object in hydration snapshots.",
          severity: "error",
          data: {
            field: "q",
            valueType: toValueType(hydration.impulseQ.q),
          },
        });
        throw new Error("set.impulseQ.qInvalid");
      }

      if (!isRecordObject(hydration.impulseQ.config)) {
        diagnostics.emit({
          code: "set.impulseQ.configInvalid",
          message: "impulseQ.config must be an object.",
          severity: "error",
          data: {
            field: "config",
            valueType: toValueType(hydration.impulseQ.config),
          },
        });
        throw new Error("set.impulseQ.configInvalid");
      }

      if (!Array.isArray(hydration.impulseQ.q.entries)) {
        diagnostics.emit({
          code: "set.impulseQ.qInvalid",
          message:
            "impulseQ.q.entries must be an array in hydration snapshots.",
          severity: "error",
          data: {
            field: "q.entries",
            valueType: toValueType(hydration.impulseQ.q.entries),
          },
        });
        throw new Error("set.impulseQ.qInvalid");
      }

      const canonicalEntries: ImpulseQEntryCanonical[] = [];
      for (const entry of hydration.impulseQ.q.entries) {
        let canonical: ReturnType<typeof canonImpulseEntry> | undefined;

        try {
          canonical = canonImpulseEntry(entry);
        } catch {
          diagnostics.emit({
            code: "set.impulseQ.entryInvalid",
            message:
              "impulseQ.q.entries contains an entry that is not canonicalizable.",
            severity: "error",
            data: {
              field: "q.entries",
              valueType: toValueType(entry),
            },
          });
          throw new Error("set.impulseQ.entryInvalid");
        }

        if (canonical.entry === undefined) {
          diagnostics.emit({
            code: "set.impulseQ.entryInvalid",
            message:
              "impulseQ.q.entries contains an entry that is not canonicalizable.",
            severity: "error",
            data: {
              field: "q.entries",
              valueType: toValueType(entry),
            },
          });
          throw new Error("set.impulseQ.entryInvalid");
        }

        canonicalEntries.push(canonical.entry);
      }

      const hydrationCursor = hydration.impulseQ.q.cursor;
      if (
        typeof hydrationCursor !== "number" ||
        !Number.isInteger(hydrationCursor) ||
        hydrationCursor < 0 ||
        hydrationCursor > canonicalEntries.length
      ) {
        diagnostics.emit({
          code: "set.impulseQ.qInvalid",
          message:
            "impulseQ.q.cursor must be an integer within entries bounds in hydration snapshots.",
          severity: "error",
          data: {
            field: "q.cursor",
            valueType: toValueType(hydrationCursor),
          },
        });
        throw new Error("set.impulseQ.qInvalid");
      }

      store.impulseQ.q.entries = canonicalEntries;
      store.impulseQ.q.cursor = hydrationCursor;

      if (
        hasOwn(hydration, "scopeProjectionBaseline") &&
        hydration.scopeProjectionBaseline !== undefined
      ) {
        store.scopeProjectionBaseline = hydration.scopeProjectionBaseline;
      } else if (isPristineHydrationTarget) {
        store.scopeProjectionBaseline = {
          flags: hydration.flags,
          changedFlags: hydration.changedFlags,
          seenFlags: hydration.seenFlags,
          signal: hydration.signal,
          seenSignals: hydration.seenSignals,
        };
      }

      if (hasOwn(hydration.impulseQ.config, "retain")) {
        store.impulseQ.config.retain = canonicalRetainForSet(
          diagnostics,
          hydration.impulseQ.config.retain,
        );
      } else {
        store.impulseQ.config.retain = 0;
      }

      if (hasOwn(hydration.impulseQ.config, "maxBytes")) {
        store.impulseQ.config.maxBytes = canonicalMaxBytesForSet(
          diagnostics,
          hydration.impulseQ.config.maxBytes,
        );
      } else {
        store.impulseQ.config.maxBytes = Number.POSITIVE_INFINITY;
      }

      store.impulseQ.config.onTrim = canonicalOnTrimForSet(
        diagnostics,
        hydration.impulseQ.config.onTrim,
      );
      store.impulseQ.config.onError = canonicalOnErrorForSet(
        diagnostics,
        hydration.impulseQ.config.onError,
      );

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
      const hasList =
        isRecordObject(incoming) &&
        hasOwn(incoming, "list") &&
        Array.isArray(incoming.list);
      const hasMap =
        isRecordObject(incoming) &&
        hasOwn(incoming, "map") &&
        isRecordObject(incoming.map);

      if (!isRecordObject(incoming) || !hasList || !hasMap) {
        diagnostics.emit({
          code: "set.flags.invalid",
          message:
            "flags patch must be an object with list(array) and map(object).",
          severity: "error",
          data: {
            valueType: toValueType(incoming),
            hasList,
            hasMap,
          },
        });
        throw new Error("set.flags.invalid");
      }

      const normalizedList = (incoming.list as unknown[]).map((flag) =>
        String(flag),
      );
      const canonical = createFlagsView(normalizedList);
      const incomingMap = incoming.map as Record<string, unknown>;

      for (const flag of canonical.list) {
        if (incomingMap[flag] !== true) {
          diagnostics.emit({
            code: "set.flags.invalid",
            message: "FlagsView must be consistent between list and map.",
            severity: "error",
            data: {
              valueType: toValueType(incoming),
              hasList,
              hasMap,
            },
          });
          throw new Error("set.flags.invalid");
        }
      }

      for (const key of Object.keys(incomingMap)) {
        if (incomingMap[key] !== true || canonical.map[key] !== true) {
          diagnostics.emit({
            code: "set.flags.invalid",
            message: "FlagsView must be consistent between list and map.",
            severity: "error",
            data: {
              valueType: toValueType(incoming),
              hasList,
              hasMap,
            },
          });
          throw new Error("set.flags.invalid");
        }
      }

      store.flagsTruth = canonical;
      store.seenFlags = extendSeenFlags(store.seenFlags, canonical.list);
    }

    if (hasOwn(patch, "addFlags") || hasOwn(patch, "removeFlags")) {
      const normalizedAddFlags = hasOwn(patch, "addFlags")
        ? readFlagDelta("addFlags", patch.addFlags)
        : [];
      const normalizedRemoveFlags = hasOwn(patch, "removeFlags")
        ? readFlagDelta("removeFlags", patch.removeFlags)
        : [];

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
      if (!isRecordObject(patch.defaults)) {
        throwSetDefaultsInvalid(diagnostics, "defaults", patch.defaults);
      }

      try {
        store.defaults = setDefaults(
          store.defaults,
          patch.defaults as SetDefaults,
        );
      } catch {
        throwSetDefaultsInvalid(diagnostics, "defaults", patch.defaults);
      }
    }

    if (hasOwn(patch, "impulseQ")) {
      const impulsePatch = patch.impulseQ;
      if (!isRecordObject(impulsePatch)) {
        const valueType = toValueType(impulsePatch);
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

      if (
        hasOwn(impulsePatch, "config") &&
        !isRecordObject(impulsePatch.config)
      ) {
        diagnostics.emit({
          code: "set.impulseQ.configInvalid",
          message: "impulseQ.config must be an object.",
          severity: "error",
          data: {
            field: "config",
            valueType: toValueType(impulsePatch.config),
          },
        });
        throw new Error("set.impulseQ.configInvalid");
      }

      if (isRecordObject(impulsePatch.config)) {
        if (hasOwn(impulsePatch.config, "retain")) {
          store.impulseQ.config.retain = canonicalRetainForSet(
            diagnostics,
            impulsePatch.config.retain,
          );
        }
        if (hasOwn(impulsePatch.config, "maxBytes")) {
          store.impulseQ.config.maxBytes = canonicalMaxBytesForSet(
            diagnostics,
            impulsePatch.config.maxBytes,
          );
        }
        if (hasOwn(impulsePatch.config, "onTrim")) {
          store.impulseQ.config.onTrim = canonicalOnTrimForSet(
            diagnostics,
            impulsePatch.config.onTrim,
          );
        }
        if (hasOwn(impulsePatch.config, "onError")) {
          store.impulseQ.config.onError = canonicalOnErrorForSet(
            diagnostics,
            impulsePatch.config.onError,
          );
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
