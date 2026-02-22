import { appendIfAbsent } from "../../state/backfillQ.js";
import {
  canonFlagSpecInput,
  type FlagSpecInput,
} from "../../canon/flagSpecInput.js";
import { hasOwn, isObject } from "../util.js";
import type { RuntimeOnError, RuntimeStore } from "../store.js";
import type { RegistryStore } from "../../state/registry.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import type {
  RegisteredExpression,
  RuntimeTarget,
} from "../../runs/coreRun.js";

const toValueType = (value: unknown): string =>
  Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  isObject(value) && Array.isArray(value) === false;

const canonicalOnErrorForAdd = (
  diagnostics: DiagnosticCollector,
  source: Record<string, unknown>,
): RuntimeOnError => {
  if (!hasOwn(source, "onError")) {
    return "report";
  }

  const onError = source.onError;
  if (onError === "throw" || onError === "report" || onError === "swallow") {
    return onError;
  }

  if (typeof onError === "function") {
    return onError as RuntimeOnError;
  }

  diagnostics.emit({
    code: "add.onError.invalid",
    message:
      'run.add onError must be "throw", "report", "swallow", or a function.',
    severity: "error",
    data: {
      field: "onError",
      valueType: toValueType(onError),
    },
  });
  throw new Error("add.onError.invalid");
};

const canonicalRunsMaxForAdd = (
  diagnostics: DiagnosticCollector,
  source: Record<string, unknown>,
): number => {
  if (!hasOwn(source, "runs")) {
    return Number.POSITIVE_INFINITY;
  }

  if (!isRecordObject(source.runs)) {
    diagnostics.emit({
      code: "add.runs.invalid",
      message: "run.add runs must be an object.",
      severity: "error",
      data: {
        field: "runs",
        valueType: toValueType(source.runs),
      },
    });
    throw new Error("add.runs.invalid");
  }

  const runs = source.runs;
  if (!hasOwn(runs, "max")) {
    return Number.POSITIVE_INFINITY;
  }

  const max = runs.max;
  if (typeof max !== "number") {
    diagnostics.emit({
      code: "add.runs.max.invalid",
      message: "run.add runs.max must be a number.",
      severity: "error",
      data: {
        field: "runs.max",
        valueType: toValueType(max),
      },
    });
    throw new Error("add.runs.max.invalid");
  }

  if (max === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  if (Number.isFinite(max)) {
    return Math.max(1, Math.floor(max));
  }

  diagnostics.emit({
    code: "add.runs.max.invalid",
    message: "run.add runs.max must be finite or positive infinity.",
    severity: "error",
    data: {
      field: "runs.max",
      valueType: toValueType(max),
    },
  });
  throw new Error("add.runs.max.invalid");
};

const canonicalRequiredForAdd = (
  diagnostics: DiagnosticCollector,
  source: Record<string, unknown>,
): RegisteredExpression["required"] => {
  if (!hasOwn(source, "required")) {
    return undefined;
  }

  if (!isRecordObject(source.required)) {
    diagnostics.emit({
      code: "add.required.invalid",
      message: "run.add required must be an object.",
      severity: "error",
      data: {
        field: "required",
        valueType: toValueType(source.required),
      },
    });
    throw new Error("add.required.invalid");
  }

  for (const key of Object.keys(source.required)) {
    if (key !== "flags") {
      diagnostics.emit({
        code: "add.required.invalid",
        message: "run.add required only supports the flags key.",
        severity: "error",
        data: {
          field: "required",
          key,
        },
      });
      throw new Error("add.required.invalid");
    }
  }

  const requiredSource = source.required;
  const requiredOut: NonNullable<RegisteredExpression["required"]> = {};

  if (hasOwn(requiredSource, "flags")) {
    if (!isRecordObject(requiredSource.flags)) {
      diagnostics.emit({
        code: "add.required.flags.invalid",
        message: "run.add required.flags must be an object.",
        severity: "error",
        data: {
          field: "required.flags",
          valueType: toValueType(requiredSource.flags),
        },
      });
      throw new Error("add.required.flags.invalid");
    }

    for (const key of Object.keys(requiredSource.flags)) {
      if (key !== "min" && key !== "max" && key !== "changed") {
        diagnostics.emit({
          code: "add.required.flags.invalid",
          message: "run.add required.flags only supports min, max and changed.",
          severity: "error",
          data: {
            field: "required.flags",
            key,
          },
        });
        throw new Error("add.required.flags.invalid");
      }
    }

    const flagsSource = requiredSource.flags;
    const flagsOut: NonNullable<
      NonNullable<RegisteredExpression["required"]>["flags"]
    > = {};

    const normalizeRequiredFlagsNumber = (
      key: "min" | "max" | "changed",
      errorCode:
        | "add.required.flags.minInvalid"
        | "add.required.flags.maxInvalid"
        | "add.required.flags.changedInvalid",
    ): void => {
      if (!hasOwn(flagsSource, key)) {
        return;
      }

      const value = flagsSource[key];
      if (typeof value !== "number" || Number.isFinite(value) === false) {
        diagnostics.emit({
          code: errorCode,
          message: `run.add required.flags.${key} must be a finite number.`,
          severity: "error",
          data: {
            field: `required.flags.${key}`,
            valueType: toValueType(value),
          },
        });
        throw new Error(errorCode);
      }

      flagsOut[key] = Math.max(0, Math.floor(value));
    };

    normalizeRequiredFlagsNumber("min", "add.required.flags.minInvalid");
    normalizeRequiredFlagsNumber("max", "add.required.flags.maxInvalid");
    normalizeRequiredFlagsNumber(
      "changed",
      "add.required.flags.changedInvalid",
    );

    if (Object.keys(flagsOut).length > 0) {
      requiredOut.flags = flagsOut;
    }
  }

  return Object.keys(requiredOut).length > 0 ? requiredOut : undefined;
};

export function runAdd(
  store: RuntimeStore,
  {
    expressionRegistry,
    diagnostics,
  }: {
    expressionRegistry: RegistryStore<RegisteredExpression>;
    diagnostics: DiagnosticCollector;
  },
  opts: unknown,
): { remove: () => void; ids: readonly string[]; retroactive: boolean } {
  return store.withRuntimeStack(() => {
    const source = isObject(opts) ? opts : {};
    const baseId =
      hasOwn(source, "id") && typeof source.id === "string"
        ? source.id
        : expressionRegistry.allocateAutoId();
    const targets = [
      ...(hasOwn(source, "targets") && Array.isArray(source.targets)
        ? source.targets
        : []),
      ...(hasOwn(source, "target") ? [source.target as RuntimeTarget] : []),
    ];

    if (targets.length === 0) {
      diagnostics.emit({
        code: "add.target.required",
        message: "run.add requires at least one target.",
        severity: "error",
      });
      throw new Error("add.target.required");
    }

    if (hasOwn(source, "signals") && !Array.isArray(source.signals)) {
      diagnostics.emit({
        code: "add.signals.invalid",
        message: "run.add signals must be an array of strings.",
        severity: "error",
        data: { field: "signals", valueType: toValueType(source.signals) },
      });
      throw new Error("add.signals.invalid");
    }

    if (hasOwn(source, "signals") && Array.isArray(source.signals)) {
      for (const [index, value] of source.signals.entries()) {
        if (typeof value !== "string") {
          diagnostics.emit({
            code: "add.signals.invalid",
            message: "run.add signals must be an array of strings.",
            severity: "error",
            data: { field: "signals", valueType: "string", index },
          });
          throw new Error("add.signals.invalid");
        }
      }
    }

    if (
      hasOwn(source, "signal") &&
      source.signal !== undefined &&
      typeof source.signal !== "string"
    ) {
      diagnostics.emit({
        code: "add.signals.invalid",
        message: "run.add signal must be a string when present.",
        severity: "error",
        data: { field: "signal", valueType: "string" },
      });
      throw new Error("add.signals.invalid");
    }

    const signals: Array<string | undefined> =
      hasOwn(source, "signals") && Array.isArray(source.signals)
        ? source.signals.length === 0
          ? [undefined]
          : (() => {
              const deduped: string[] = [];
              const seen = new Set<string>();

              for (const signal of source.signals) {
                if (seen.has(signal)) {
                  continue;
                }
                seen.add(signal);
                deduped.push(signal);
              }

              if (deduped.length < source.signals.length) {
                diagnostics.emit({
                  code: "add.signals.dedup",
                  message:
                    "run.add signals were deduplicated by first occurrence.",
                  severity: "warn",
                  data: {
                    signals: source.signals,
                    deduped,
                  },
                });
              }

              return deduped;
            })()
        : hasOwn(source, "signal") && source.signal !== undefined
          ? [source.signal as string]
          : [undefined];

    for (const target of targets) {
      if (typeof target === "function") {
        continue;
      }

      if (
        !isObject(target) ||
        !hasOwn(target, "on") ||
        !isRecordObject(target.on)
      ) {
        diagnostics.emit({
          code: "add.objectTarget.missingEntrypoint",
          message: "Object target must expose an object `on` entrypoint.",
          severity: "error",
        });
        throw new Error("add.objectTarget.missingEntrypoint");
      }

      for (const sig of signals) {
        if (sig === undefined) {
          continue;
        }

        if (sig === "everyRun" || !hasOwn(target.on, sig)) {
          diagnostics.emit({
            code: "add.objectTarget.missingHandler",
            message:
              sig === "everyRun"
                ? "Signal `everyRun` is reserved and cannot be used as a signal handler key."
                : `Object target is missing handler for signal "${sig}".`,
            severity: "error",
            data: { signal: sig },
          });
          throw new Error("add.objectTarget.missingHandler");
        }

        if (typeof target.on[sig] !== "function") {
          diagnostics.emit({
            code: "add.objectTarget.nonCallableHandler",
            message: `Object target handler for signal "${sig}" must be callable.`,
            severity: "error",
            data: { signal: sig },
          });
          throw new Error("add.objectTarget.nonCallableHandler");
        }
      }
    }

    const expressionFlags = hasOwn(source, "flags")
      ? canonFlagSpecInput(source.flags as FlagSpecInput)
      : undefined;
    const normalizedRequired = canonicalRequiredForAdd(diagnostics, source);

    const ids: string[] = [];
    const retroactive =
      hasOwn(source, "retroactive") && source.retroactive === true;
    const runsMax = canonicalRunsMaxForAdd(diagnostics, source);
    const onError = canonicalOnErrorForAdd(diagnostics, source);

    const readBackfillSource = (): Record<string, unknown> | undefined => {
      if (!hasOwn(source, "backfill")) {
        return undefined;
      }

      if (!isRecordObject(source.backfill)) {
        diagnostics.emit({
          code: "add.backfill.invalid",
          message: "run.add backfill must be an object.",
          severity: "error",
          data: {
            field: "backfill",
            valueType: toValueType(source.backfill),
          },
        });
        throw new Error("add.backfill.invalid");
      }

      return source.backfill;
    };

    const readBackfillGateConfig = (
      backfill: Record<string, unknown>,
      gate: "signal" | "flags",
    ): Record<string, unknown> | undefined => {
      if (!hasOwn(backfill, gate)) {
        return undefined;
      }

      if (!isRecordObject(backfill[gate])) {
        const code = `add.backfill.${gate}.invalid` as const;
        diagnostics.emit({
          code,
          message: `run.add backfill.${gate} must be an object.`,
          severity: "error",
          data: {
            field: `backfill.${gate}`,
            valueType: toValueType(backfill[gate]),
          },
        });
        throw new Error(code);
      }

      return backfill[gate];
    };

    const readBackfillGateRunsMax = (
      gate: "signal" | "flags",
      gateConfig: Record<string, unknown> | undefined,
      fallback: number,
    ): number => {
      if (gateConfig === undefined) {
        return fallback;
      }

      if (!hasOwn(gateConfig, "runs")) {
        return fallback;
      }

      if (!isRecordObject(gateConfig.runs)) {
        const code = `add.backfill.${gate}.runs.invalid` as const;
        diagnostics.emit({
          code,
          message: `run.add backfill.${gate}.runs must be an object.`,
          severity: "error",
          data: {
            field: `backfill.${gate}.runs`,
            valueType: toValueType(gateConfig.runs),
          },
        });
        throw new Error(code);
      }

      const runs = gateConfig.runs;
      if (!hasOwn(runs, "max")) {
        return fallback;
      }

      const max = runs.max;
      if (typeof max !== "number") {
        const code = `add.backfill.${gate}.runs.max.invalid` as const;
        diagnostics.emit({
          code,
          message: `run.add backfill.${gate}.runs.max must be a number.`,
          severity: "error",
          data: {
            field: `backfill.${gate}.runs.max`,
            valueType: toValueType(max),
          },
        });
        throw new Error(code);
      }

      if (max === Number.POSITIVE_INFINITY) {
        return Number.POSITIVE_INFINITY;
      }

      if (Number.isFinite(max)) {
        return Math.max(1, Math.floor(max));
      }

      const code = `add.backfill.${gate}.runs.max.invalid` as const;
      diagnostics.emit({
        code,
        message: `run.add backfill.${gate}.runs.max must be finite or positive infinity.`,
        severity: "error",
        data: {
          field: `backfill.${gate}.runs.max`,
          valueType: toValueType(max),
        },
      });
      throw new Error(code);
    };

    const readBackfillDebt = (
      gate: "signal" | "flags",
      gateConfig: Record<string, unknown> | undefined,
    ): number | undefined => {
      if (gateConfig === undefined) {
        return undefined;
      }

      if (!hasOwn(gateConfig, "debt")) {
        return undefined;
      }

      const debt = gateConfig.debt;
      if (typeof debt !== "number" || Number.isFinite(debt) === false) {
        const code = `add.backfill.${gate}.debt.invalid` as const;
        diagnostics.emit({
          code,
          message: `run.add backfill.${gate}.debt must be a finite number.`,
          severity: "error",
          data: {
            field: `backfill.${gate}.debt`,
            valueType: toValueType(debt),
          },
        });
        throw new Error(code);
      }

      return Math.max(0, Math.floor(debt));
    };

    const createNormalizedBackfill = (): RegisteredExpression["backfill"] => {
      const backfill = readBackfillSource();
      if (backfill === undefined) {
        return undefined;
      }

      const signalGateConfig = readBackfillGateConfig(backfill, "signal");
      const flagsGateConfig = readBackfillGateConfig(backfill, "flags");

      const signalDebt = readBackfillDebt("signal", signalGateConfig);
      const flagsDebt = readBackfillDebt("flags", flagsGateConfig);

      return {
        signal: {
          ...(signalDebt !== undefined ? { debt: signalDebt } : {}),
          runs: {
            used: 0,
            max: readBackfillGateRunsMax(
              "signal",
              signalGateConfig,
              Number.POSITIVE_INFINITY,
            ),
          },
        },
        flags: {
          ...(flagsDebt !== undefined ? { debt: flagsDebt } : {}),
          runs: {
            used: 0,
            max: readBackfillGateRunsMax(
              "flags",
              flagsGateConfig,
              Number.POSITIVE_INFINITY,
            ),
          },
        },
      };
    };

    for (const [index, sig] of signals.entries()) {
      const id = signals.length > 1 ? `${baseId}:${index}` : baseId;
      const normalizedBackfill = createNormalizedBackfill();
      expressionRegistry.register({
        id,
        ...(sig !== undefined ? { signal: sig } : {}),
        ...(expressionFlags ? { flags: expressionFlags } : {}),
        ...(normalizedRequired !== undefined
          ? { required: normalizedRequired }
          : {}),
        ...(normalizedBackfill !== undefined
          ? { backfill: normalizedBackfill }
          : {}),
        onError,
        runs: {
          used: 0,
          max: runsMax,
        },
        targets,
      });

      const registered = expressionRegistry.resolve(id);
      const hasInitialDebt =
        (normalizedBackfill?.signal?.debt ?? 0) > 0 ||
        (normalizedBackfill?.flags?.debt ?? 0) > 0;
      if (registered !== undefined && hasInitialDebt) {
        appendIfAbsent(store.backfillQ, registered);
      }

      ids.push(id);
    }

    return {
      ids,
      retroactive,
      remove: () => {
        for (const id of ids) {
          expressionRegistry.remove(id);
        }
      },
    };
  });
}
