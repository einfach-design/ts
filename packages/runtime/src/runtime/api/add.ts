import {
  canonFlagSpecInput,
  type FlagSpecInput,
} from "../../canon/flagSpecInput.js";
import { hasOwn, isObject } from "../util.js";
import type { RuntimeStore } from "../store.js";
import type { RegistryStore } from "../../state/registry.js";

type RuntimeTarget =
  | ((i: unknown, a: unknown, r: unknown) => void)
  | { on: Record<string, unknown> };

type RegisteredExpression = {
  id: string;
  tombstone?: true;
  signal?: string;
  flags?: ReturnType<typeof canonFlagSpecInput>;
  required?: { flags?: { min?: number; max?: number; changed?: number } };
  backfill?: {
    signal?: { debt?: number; runs?: { used: number; max: number } };
    flags?: { debt?: number; runs?: { used: number; max: number } };
  };
  runs?: { used: number; max: number };
  targets: RuntimeTarget[];
};

export function runAdd(
  store: RuntimeStore,
  {
    expressionRegistry,
  }: { expressionRegistry: RegistryStore<RegisteredExpression> },
  opts: unknown,
): () => void {
  return store.withRuntimeStack(() => {
    const source = isObject(opts) ? opts : {};
    const baseId =
      typeof source.id === "string"
        ? source.id
        : `reg:${expressionRegistry.registeredQ.length + 1}`;
    const targets = [
      ...(Array.isArray(source.targets) ? source.targets : []),
      ...(hasOwn(source, "target") ? [source.target as RuntimeTarget] : []),
    ];

    if (targets.length === 0) {
      throw new Error("add.target.required");
    }

    const signals = Array.isArray(source.signals)
      ? source.signals
      : source.signal !== undefined
        ? [source.signal as string]
        : [undefined];

    for (const target of targets) {
      if (typeof target === "function") {
        continue;
      }

      if (!isObject(target) || !isObject(target.on)) {
        throw new Error("add.objectTarget.missingEntrypoint");
      }

      for (const sig of signals) {
        if (sig === undefined) {
          continue;
        }

        if (sig === "everyRun" || !hasOwn(target.on, sig)) {
          throw new Error("add.objectTarget.missingHandler");
        }

        if (typeof target.on[sig] !== "function") {
          throw new Error("add.objectTarget.nonCallableHandler");
        }
      }
    }

    const expressionFlags = hasOwn(source, "flags")
      ? canonFlagSpecInput(source.flags as FlagSpecInput)
      : undefined;

    const ids: string[] = [];
    const runsMax =
      isObject(source.runs) && typeof source.runs.max === "number"
        ? Math.max(1, source.runs.max)
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
        typeof gateConfig.runs.max === "number"
        ? Math.max(1, gateConfig.runs.max)
        : fallback;
    };

    const createNormalizedBackfill = (): RegisteredExpression["backfill"] => {
      if (!hasOwn(source, "backfill")) {
        return undefined;
      }

      return {
        signal: {
          ...(isObject(source.backfill) &&
          isObject(source.backfill.signal) &&
          hasOwn(source.backfill.signal, "debt")
            ? { debt: source.backfill.signal.debt as number }
            : {}),
          runs: {
            used: 0,
            max: readBackfillGateRunsMax("signal", Number.POSITIVE_INFINITY),
          },
        },
        flags: {
          ...(isObject(source.backfill) &&
          isObject(source.backfill.flags) &&
          hasOwn(source.backfill.flags, "debt")
            ? { debt: source.backfill.flags.debt as number }
            : {}),
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
        ...(source.required !== undefined
          ? {
              required: source.required as NonNullable<
                RegisteredExpression["required"]
              >,
            }
          : {}),
        ...(normalizedBackfill !== undefined
          ? { backfill: normalizedBackfill }
          : {}),
        runs: {
          used: 0,
          max: runsMax,
        },
        targets,
      });
      ids.push(id);
    }

    return () => {
      for (const id of ids) {
        expressionRegistry.remove(id);
      }
    };
  });
}
