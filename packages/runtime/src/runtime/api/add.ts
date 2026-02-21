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

    const signals =
      hasOwn(source, "signals") && Array.isArray(source.signals)
        ? source.signals.length === 0
          ? [undefined]
          : source.signals
        : hasOwn(source, "signal") && source.signal !== undefined
          ? [source.signal as string]
          : [undefined];

    for (const target of targets) {
      if (typeof target === "function") {
        continue;
      }

      if (!isObject(target) || !isObject(target.on)) {
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
    const runsMax =
      hasOwn(source, "runs") &&
      isObject(source.runs) &&
      typeof source.runs.max === "number" &&
      Number.isFinite(source.runs.max)
        ? Math.max(1, Math.floor(source.runs.max))
        : Number.POSITIVE_INFINITY;

    const readBackfillGateRunsMax = (
      gate: "signal" | "flags",
      fallback: number,
    ): number => {
      if (!hasOwn(source, "backfill") || !isObject(source.backfill)) {
        return fallback;
      }

      const backfill = source.backfill;
      if (!hasOwn(backfill, gate) || !isObject(backfill[gate])) {
        return fallback;
      }

      const gateConfig = backfill[gate];
      if (!hasOwn(gateConfig, "runs") || !isObject(gateConfig.runs)) {
        return fallback;
      }

      return hasOwn(gateConfig.runs, "max") &&
        typeof gateConfig.runs.max === "number" &&
        Number.isFinite(gateConfig.runs.max)
        ? Math.max(1, Math.floor(gateConfig.runs.max))
        : fallback;
    };

    const readBackfillDebt = (gate: "signal" | "flags"): number | undefined => {
      if (!hasOwn(source, "backfill") || !isObject(source.backfill)) {
        return undefined;
      }

      const backfill = source.backfill;
      if (!hasOwn(backfill, gate) || !isObject(backfill[gate])) {
        return undefined;
      }

      const gateConfig = backfill[gate];
      if (!hasOwn(gateConfig, "debt") || typeof gateConfig.debt !== "number") {
        return undefined;
      }

      if (!Number.isFinite(gateConfig.debt)) {
        return 0;
      }

      return Math.max(0, Math.floor(gateConfig.debt));
    };

    const createNormalizedBackfill = (): RegisteredExpression["backfill"] => {
      if (!hasOwn(source, "backfill")) {
        return undefined;
      }

      const signalDebt = readBackfillDebt("signal");
      const flagsDebt = readBackfillDebt("flags");

      return {
        signal: {
          ...(signalDebt !== undefined ? { debt: signalDebt } : {}),
          runs: {
            used: 0,
            max: readBackfillGateRunsMax("signal", Number.POSITIVE_INFINITY),
          },
        },
        flags: {
          ...(flagsDebt !== undefined ? { debt: flagsDebt } : {}),
          runs: {
            used: 0,
            max: readBackfillGateRunsMax("flags", Number.POSITIVE_INFINITY),
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
        ...(hasOwn(source, "onError")
          ? { onError: source.onError as RuntimeOnError }
          : {}),
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
