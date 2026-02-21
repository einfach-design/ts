import {
  canonImpulseEntry,
  type ImpulseQEntryCanonical,
} from "../../canon/impulseEntry.js";
import { trim } from "../../processing/trim.js";
import { createBackfillQ } from "../../state/backfillQ.js";
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

const hydrationRequiredKeys = [
  "defaults",
  "flags",
  "changedFlags",
  "seenFlags",
  "signal",
  "seenSignals",
  "impulseQ",
  "backfillQ",
] as const;

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

const isScopeValue = (
  value: unknown,
): value is "applied" | "pending" | "pendingOnly" =>
  value === "applied" || value === "pending" || value === "pendingOnly";

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

  const scopeSignal = scope.signal as Record<string, unknown>;
  if (!isScopeValue(scopeSignal.value)) {
    throwSetDefaultsInvalid(
      diagnostics,
      "defaults.scope.signal.value",
      scopeSignal.value,
    );
  }

  const scopeFlags = scope.flags as Record<string, unknown>;
  if (!isScopeValue(scopeFlags.value)) {
    throwSetDefaultsInvalid(
      diagnostics,
      "defaults.scope.flags.value",
      scopeFlags.value,
    );
  }

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

  if (!isRecordObject(defaultsRecord.methods)) {
    throwSetDefaultsInvalid(
      diagnostics,
      "defaults.methods",
      defaultsRecord.methods,
    );
  }

  const methods = defaultsRecord.methods as Record<string, unknown>;
  for (const method of ["on", "when"] as const) {
    if (!isRecordObject(methods[method])) {
      throwSetDefaultsInvalid(
        diagnostics,
        `defaults.methods.${method}`,
        methods[method],
      );
    }

    const entry = methods[method] as Record<string, unknown>;
    if (
      hasOwn(entry, "signals") ||
      hasOwn(entry, "flags") ||
      hasOwn(entry, "targets")
    ) {
      throwSetDefaultsInvalid(diagnostics, `defaults.methods.${method}`, entry);
    }

    const stack: Array<{ value: Record<string, unknown>; path: string }> = [
      { value: entry, path: `defaults.methods.${method}` },
    ];

    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const key of Object.keys(current.value)) {
        const nextValue = current.value[key];
        if (nextValue === undefined) {
          throwSetDefaultsInvalid(
            diagnostics,
            `${current.path}.${key}`,
            nextValue,
          );
        }
        if (isRecordObject(nextValue)) {
          stack.push({
            value: nextValue,
            path: `${current.path}.${key}`,
          });
        }
      }
    }
  }
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

    if (retain === Number.POSITIVE_INFINITY) {
      return Number.POSITIVE_INFINITY;
    }

    if (Number.isFinite(retain)) {
      return Math.max(0, Math.floor(retain));
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

    if (maxBytes === Number.POSITIVE_INFINITY) {
      return Number.POSITIVE_INFINITY;
    }

    if (Number.isFinite(maxBytes)) {
      return Math.max(0, Math.floor(maxBytes));
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
  const emitFlagDeltaInvalid = (
    field: "addFlags" | "removeFlags",
    value: unknown,
  ): never => {
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
        const normalizedList = (value.list as unknown[]).map((entry) =>
          String(entry),
        );
        const canonical = createFlagsView(normalizedList);
        const incomingMap = value.map as Record<string, unknown>;

        for (const flag of canonical.list) {
          if (incomingMap[flag] !== true) {
            emitFlagDeltaInvalid(field, value);
          }
        }

        for (const key of Object.keys(incomingMap)) {
          if (incomingMap[key] !== true || canonical.map[key] !== true) {
            emitFlagDeltaInvalid(field, value);
          }
        }

        return [...canonical.list];
      }
    }

    return emitFlagDeltaInvalid(field, value);
  };

  const emitHydrationFlagsViewInvalid = (
    field: "flags" | "seenFlags" | "changedFlags",
    value: unknown,
  ): never => {
    diagnostics.emit({
      code: "set.hydration.flagsViewInvalid",
      message: "Hydration FlagsView must be a consistent { list, map } object.",
      severity: "error",
      data: {
        field,
        valueType: toValueType(value),
      },
    });
    throw new Error("set.hydration.flagsViewInvalid");
  };

  const assertHydrationFlagsView = (
    field: "flags" | "seenFlags" | "changedFlags",
    value: unknown,
  ): FlagsView => {
    if (!isRecordObject(value)) {
      emitHydrationFlagsViewInvalid(field, value);
    }

    const valueRecord = value as Record<string, unknown>;

    if (!hasOwn(valueRecord, "list") || !Array.isArray(valueRecord.list)) {
      emitHydrationFlagsViewInvalid(field, value);
    }

    if (!hasOwn(valueRecord, "map") || !isRecordObject(valueRecord.map)) {
      emitHydrationFlagsViewInvalid(field, value);
    }

    const normalizedList = (valueRecord.list as unknown[]).map((entry) =>
      String(entry),
    );
    const canonical = createFlagsView(normalizedList);
    const incomingMap = valueRecord.map as Record<string, unknown>;

    for (const flag of canonical.list) {
      if (incomingMap[flag] !== true) {
        emitHydrationFlagsViewInvalid(field, value);
      }
    }

    for (const key of Object.keys(incomingMap)) {
      if (incomingMap[key] !== true || canonical.map[key] !== true) {
        emitHydrationFlagsViewInvalid(field, value);
      }
    }

    return canonical;
  };

  const assertHydrationSeenSignals = (value: unknown): SeenSignals => {
    if (!isRecordObject(value)) {
      diagnostics.emit({
        code: "set.hydration.seenSignalsInvalid",
        message:
          "Hydration seenSignals must be a consistent { list, map } object.",
        severity: "error",
        data: { field: "seenSignals", valueType: toValueType(value) },
      });
      throw new Error("set.hydration.seenSignalsInvalid");
    }

    if (
      !hasOwn(value, "list") ||
      !Array.isArray(value.list) ||
      !hasOwn(value, "map") ||
      !isRecordObject(value.map)
    ) {
      diagnostics.emit({
        code: "set.hydration.seenSignalsInvalid",
        message:
          "Hydration seenSignals must be a consistent { list, map } object.",
        severity: "error",
        data: { field: "seenSignals", valueType: toValueType(value) },
      });
      throw new Error("set.hydration.seenSignalsInvalid");
    }

    const canonical = createFlagsView(
      (value.list as unknown[]).map((entry) => String(entry)),
    );
    const incomingMap = value.map as Record<string, unknown>;

    for (const signal of canonical.list) {
      if (incomingMap[signal] !== true) {
        diagnostics.emit({
          code: "set.hydration.seenSignalsInvalid",
          message:
            "Hydration seenSignals must be a consistent { list, map } object.",
          severity: "error",
          data: { field: "seenSignals", valueType: toValueType(value) },
        });
        throw new Error("set.hydration.seenSignalsInvalid");
      }
    }

    for (const key of Object.keys(incomingMap)) {
      if (incomingMap[key] !== true || canonical.map[key] !== true) {
        diagnostics.emit({
          code: "set.hydration.seenSignalsInvalid",
          message:
            "Hydration seenSignals must be a consistent { list, map } object.",
          severity: "error",
          data: { field: "seenSignals", valueType: toValueType(value) },
        });
        throw new Error("set.hydration.seenSignalsInvalid");
      }
    }

    return canonical as SeenSignals;
  };

  const assertHydrationSignal = (value: unknown): string | undefined => {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      diagnostics.emit({
        code: "set.hydration.signalInvalid",
        message: "Hydration signal must be a string when present.",
        severity: "error",
        data: { field: "signal", valueType: toValueType(value) },
      });
      throw new Error("set.hydration.signalInvalid");
    }

    return value;
  };

  const assertHydrationBackfillQ = (value: unknown): FlagsView => {
    if (
      !isRecordObject(value) ||
      !hasOwn(value, "list") ||
      !Array.isArray(value.list) ||
      !hasOwn(value, "map") ||
      !isRecordObject(value.map)
    ) {
      diagnostics.emit({
        code: "set.hydration.backfillQInvalid",
        message:
          "Hydration backfillQ must be a consistent { list, map } object.",
        severity: "error",
        data: { field: "backfillQ", valueType: toValueType(value) },
      });
      throw new Error("set.hydration.backfillQInvalid");
    }

    const canonical = createFlagsView(
      (value.list as unknown[]).map((entry) => String(entry)),
    );
    const incomingMap = value.map as Record<string, unknown>;

    for (const id of canonical.list) {
      if (incomingMap[id] !== true) {
        diagnostics.emit({
          code: "set.hydration.backfillQInvalid",
          message:
            "Hydration backfillQ must be a consistent { list, map } object.",
          severity: "error",
          data: { field: "backfillQ", valueType: toValueType(value) },
        });
        throw new Error("set.hydration.backfillQInvalid");
      }
    }

    for (const key of Object.keys(incomingMap)) {
      if (incomingMap[key] !== true || canonical.map[key] !== true) {
        diagnostics.emit({
          code: "set.hydration.backfillQInvalid",
          message:
            "Hydration backfillQ must be a consistent { list, map } object.",
          severity: "error",
          data: { field: "backfillQ", valueType: toValueType(value) },
        });
        throw new Error("set.hydration.backfillQInvalid");
      }
    }

    return canonical;
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

      const hydration = patch as Record<string, unknown>;
      const isPristineHydrationTarget =
        store.impulseQ.q.entries.length === 0 &&
        store.impulseQ.q.cursor === 0 &&
        store.flagsTruth.list.length === 0 &&
        store.seenFlags.list.length === 0 &&
        store.signal === undefined &&
        store.seenSignals.list.length === 0;

      assertValidDefaultsSnapshot(diagnostics, hydration.defaults);
      const hydrationDefaults = hydration.defaults as Defaults;
      const nextDefaults: Defaults = {
        scope: {
          signal: {
            value: hydrationDefaults.scope.signal.value,
            force:
              hydrationDefaults.scope.signal.force === true ? true : undefined,
          },
          flags: {
            value: hydrationDefaults.scope.flags.value,
            force:
              hydrationDefaults.scope.flags.force === true ? true : undefined,
          },
        },
        gate: {
          signal: {
            value: hydrationDefaults.gate.signal.value,
            force:
              hydrationDefaults.gate.signal.force === true ? true : undefined,
          },
          flags: {
            value: hydrationDefaults.gate.flags.value,
            force:
              hydrationDefaults.gate.flags.force === true ? true : undefined,
          },
        },
        methods: {
          on: isRecordObject(hydrationDefaults.methods.on)
            ? structuredClone(hydrationDefaults.methods.on)
            : {},
          when: isRecordObject(hydrationDefaults.methods.when)
            ? structuredClone(hydrationDefaults.methods.when)
            : {},
        },
      };
      const nextFlagsTruth = assertHydrationFlagsView("flags", hydration.flags);
      const nextSeenFlags = assertHydrationFlagsView(
        "seenFlags",
        hydration.seenFlags,
      );
      const hasHydrationChangedFlags =
        hasOwn(hydration, "changedFlags") &&
        hydration.changedFlags !== undefined;
      const nextChangedFlags = hasHydrationChangedFlags
        ? assertHydrationFlagsView("changedFlags", hydration.changedFlags)
        : undefined;
      const nextSeenSignals = assertHydrationSeenSignals(hydration.seenSignals);
      const nextSignal = hasOwn(hydration, "signal")
        ? assertHydrationSignal(hydration.signal)
        : undefined;
      const nextBackfillQ = assertHydrationBackfillQ(hydration.backfillQ);

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
      for (const entry of hydration.impulseQ.q.entries as unknown[]) {
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

        const canonicalEntry = canonical.entry;
        const storedEntry: ImpulseQEntryCanonical = {
          ...(canonicalEntry.onError !== undefined
            ? { onError: canonicalEntry.onError }
            : {}),
          signals: [...canonicalEntry.signals],
          addFlags: [...canonicalEntry.addFlags],
          removeFlags: [...canonicalEntry.removeFlags],
          useFixedFlags:
            canonicalEntry.useFixedFlags === false
              ? false
              : createFlagsView([...canonicalEntry.useFixedFlags.list]),
          ...(hasOwn(canonicalEntry, "livePayload")
            ? { livePayload: canonicalEntry.livePayload }
            : {}),
        };

        canonicalEntries.push(storedEntry);
      }

      const hydrationCursor = (hydration.impulseQ.q as Record<string, unknown>)
        .cursor;
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

      const impulseConfig = hydration.impulseQ.config as Record<
        string,
        unknown
      >;
      const nextRetain = hasOwn(impulseConfig, "retain")
        ? canonicalRetainForSet(diagnostics, impulseConfig.retain)
        : 0;
      const nextMaxBytes = hasOwn(impulseConfig, "maxBytes")
        ? canonicalMaxBytesForSet(diagnostics, impulseConfig.maxBytes)
        : Number.POSITIVE_INFINITY;
      const nextOnTrim = canonicalOnTrimForSet(
        diagnostics,
        impulseConfig.onTrim,
      );
      const nextOnError = canonicalOnErrorForSet(
        diagnostics,
        impulseConfig.onError,
      );

      const nextBackfillStore = createBackfillQ<RegisteredExpression>();
      for (const id of nextBackfillQ.list) {
        const expression = expressionRegistry.resolve(id);
        if (expression) {
          nextBackfillStore.list.push(expression);
          nextBackfillStore.map[id] = true;
          continue;
        }

        store.reportRuntimeError(
          new Error(`Hydration backfill id could not be resolved: ${id}`),
          "set/hydration/backfillQ",
          { regExpressionId: id },
        );
      }

      const nextScopeProjectionBaseline =
        hasOwn(hydration, "scopeProjectionBaseline") &&
        hydration.scopeProjectionBaseline !== undefined
          ? (hydration.scopeProjectionBaseline as ScopeProjectionBaseline)
          : isPristineHydrationTarget
            ? {
                flags: nextFlagsTruth,
                changedFlags: hasOwn(hydration, "changedFlags")
                  ? nextChangedFlags
                  : undefined,
                seenFlags: nextSeenFlags,
                signal: nextSignal,
                seenSignals: nextSeenSignals,
              }
            : store.scopeProjectionBaseline;

      store.defaults = nextDefaults;
      store.flagsTruth = nextFlagsTruth;
      store.changedFlags = hasOwn(hydration, "changedFlags")
        ? nextChangedFlags
        : undefined;
      store.seenFlags = nextSeenFlags;
      store.signal = nextSignal;
      store.seenSignals = nextSeenSignals;
      store.impulseQ.q.entries = canonicalEntries;
      store.impulseQ.q.cursor = hydrationCursor;
      store.impulseQ.config.retain = nextRetain;
      store.impulseQ.config.maxBytes = nextMaxBytes;
      store.impulseQ.config.onTrim = nextOnTrim;
      store.impulseQ.config.onError = nextOnError;
      // trimPendingMaxBytes is runtime-only and must be reset after successful hydration.
      // Otherwise a deferred trim from pre-hydration state can fire later as a stale side-effect.
      store.trimPendingMaxBytes = false;
      store.backfillQ = nextBackfillStore;
      store.scopeProjectionBaseline = nextScopeProjectionBaseline;

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

    let nextDefaults = store.defaults;
    let nextFlagsTruth = store.flagsTruth;
    let nextChangedFlags = store.changedFlags;
    let nextSeenFlags = store.seenFlags;
    let nextSignal = store.signal;
    let nextSeenSignals = store.seenSignals;
    let nextImpulseEntries = store.impulseQ.q.entries;
    let nextImpulseCursor = store.impulseQ.q.cursor;
    let nextImpulseConfigRetain = store.impulseQ.config.retain;
    let nextImpulseConfigMaxBytes = store.impulseQ.config.maxBytes;
    let nextImpulseOnTrim = store.impulseQ.config.onTrim;
    let nextImpulseOnError = store.impulseQ.config.onError;
    let nextTrimPendingMaxBytes = store.trimPendingMaxBytes;

    let trimOnTrimError: Error | undefined;
    let trimRemovedAppliedEntries: ImpulseQEntryCanonical[] | undefined;

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

      nextFlagsTruth = canonical;
      nextSeenFlags = extendSeenFlags(nextSeenFlags, canonical.list);
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

      nextFlagsTruth = applyFlagDeltas(
        nextFlagsTruth,
        normalizedAddFlags,
        normalizedRemoveFlags,
      );
      nextChangedFlags = undefined;

      const seenInput = [...normalizedAddFlags, ...normalizedRemoveFlags];
      nextSeenFlags = extendSeenFlags(nextSeenFlags, seenInput);
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
        ...(nextSignal !== undefined ? { previousSignal: nextSignal } : {}),
        previousSeenSignals: nextSeenSignals,
        signals: patch.signals,
      });

      nextSignal = nextSignals.signal;
      nextSeenSignals = nextSignals.seenSignals;
    }

    if (hasOwn(patch, "defaults")) {
      if (!isRecordObject(patch.defaults)) {
        throwSetDefaultsInvalid(diagnostics, "defaults", patch.defaults);
      }

      try {
        nextDefaults = setDefaults(nextDefaults, patch.defaults as SetDefaults);
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
          nextImpulseConfigRetain = canonicalRetainForSet(
            diagnostics,
            impulsePatch.config.retain,
          );
        }
        if (hasOwn(impulsePatch.config, "maxBytes")) {
          nextImpulseConfigMaxBytes = canonicalMaxBytesForSet(
            diagnostics,
            impulsePatch.config.maxBytes,
          );
        }
        if (hasOwn(impulsePatch.config, "onTrim")) {
          nextImpulseOnTrim = canonicalOnTrimForSet(
            diagnostics,
            impulsePatch.config.onTrim,
          );
        }
        if (hasOwn(impulsePatch.config, "onError")) {
          nextImpulseOnError = canonicalOnErrorForSet(
            diagnostics,
            impulsePatch.config.onError,
          );
        }

        const trimmed = trim({
          entries: nextImpulseEntries,
          cursor: nextImpulseCursor,
          retain: nextImpulseConfigRetain,
          maxBytes: nextImpulseConfigMaxBytes,
          runtimeStackActive: store.runtimeStackDepth > 0,
          trimPendingMaxBytes: nextTrimPendingMaxBytes,
          measureBytes: measureEntryBytes,
          ...(nextImpulseOnTrim !== undefined
            ? { onTrim: nextImpulseOnTrim }
            : {}),
        });

        trimOnTrimError = trimmed.onTrimError as Error | undefined;
        const removedCount = Math.max(0, nextImpulseCursor - trimmed.cursor);
        if (removedCount > 0) {
          trimRemovedAppliedEntries = nextImpulseEntries.slice(0, removedCount);
        }

        nextImpulseEntries = [...trimmed.entries];
        nextImpulseCursor = trimmed.cursor;
        nextTrimPendingMaxBytes = trimmed.trimPendingMaxBytes;
      }
    }

    store.defaults = nextDefaults;
    store.flagsTruth = nextFlagsTruth;
    store.changedFlags = nextChangedFlags;
    store.seenFlags = nextSeenFlags;
    store.signal = nextSignal;
    store.seenSignals = nextSeenSignals;
    store.impulseQ.q.entries = nextImpulseEntries;
    store.impulseQ.q.cursor = nextImpulseCursor;
    store.impulseQ.config.retain = nextImpulseConfigRetain;
    store.impulseQ.config.maxBytes = nextImpulseConfigMaxBytes;
    store.impulseQ.config.onTrim = nextImpulseOnTrim;
    store.impulseQ.config.onError = nextImpulseOnError;
    store.trimPendingMaxBytes = nextTrimPendingMaxBytes;

    if (trimOnTrimError !== undefined) {
      store.reportRuntimeError(trimOnTrimError, "trim/onTrim");
    }

    if (
      trimRemovedAppliedEntries !== undefined &&
      trimRemovedAppliedEntries.length > 0
    ) {
      store.applyTrimmedAppliedEntriesToScopeBaseline(
        trimRemovedAppliedEntries,
      );
    }
  });
}
