/**
 * @file packages/runtime/src/runtime.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Runtime public API facade and core wiring.
 */

import {
  canonFlagSpecInput,
  type FlagSpecInput,
} from "./canon/flagSpecInput.js";
import {
  canonImpulseEntry,
  type ImpulseQEntryCanonical,
} from "./canon/impulseEntry.js";
import {
  createDiagnosticCollector,
  type RuntimeDiagnostic,
} from "./diagnostics/index.js";
import { matchExpression as runMatchExpression } from "./match/matchExpression.js";
import { actImpulse } from "./processing/actImpulse.js";
import { drain } from "./processing/drain.js";
import { trim } from "./processing/trim.js";
import { backfillRun } from "./runs/backfillRun.js";
import { registeredRun } from "./runs/registeredRun.js";
import {
  globalDefaults,
  setDefaults,
  type Defaults,
  type SetDefaults,
} from "./state/defaults.js";
import {
  createBackfillQ,
  toBackfillQSnapshot,
  type BackfillQSnapshot,
} from "./state/backfillQ.js";
import { computeChangedFlags } from "./state/changedFlags.js";
import { createFlagsView, type FlagsView } from "./state/flagsView.js";
import { registry } from "./state/registry.js";
import {
  extendSeenSignals,
  projectSignal,
  type SeenSignals,
} from "./state/signals.js";
import { dispatch } from "./targets/dispatch.js";

type RuntimeTarget =
  | ((i: RuntimeOccurrence, a: RegisteredExpression, r: RuntimeCore) => void)
  | { on: Record<string, unknown> };

type RuntimeOccurrence = Readonly<{
  signal?: string;
  flags: FlagsView;
  changedFlags: FlagsView;
  addFlags: readonly string[];
  removeFlags: readonly string[];
  payload?: unknown;
}>;

type RegisteredExpression = {
  id: string;
  signal?: string;
  flags?: ReturnType<typeof canonFlagSpecInput>;
  required?: { flags?: { min?: number; max?: number; changed?: number } };
  targets: RuntimeTarget[];
  backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
  tombstone?: true;
};

type RuntimeCore = Readonly<{
  get: Runtime["get"];
  matchExpression: Runtime["matchExpression"];
}>;

type Runtime = Readonly<{
  add: (opts: {
    id?: string;
    signal?: string;
    signals?: readonly string[];
    flags?: FlagSpecInput;
    required?: { flags?: { min?: number; max?: number; changed?: number } };
    target?: RuntimeTarget;
    targets?: readonly RuntimeTarget[];
    backfill?: RegisteredExpression["backfill"];
  }) => { ids: readonly string[]; remove: () => void };
  impulse: (opts?: unknown) => void;
  get: (
    key?: string,
    opts?: { as?: "snapshot" | "reference"; scope?: string },
  ) => unknown;
  set: (patch: Record<string, unknown>) => void;
  matchExpression: (opts: Parameters<typeof runMatchExpression>[0]) => boolean;
  onDiagnostic: (
    handler: (diagnostic: RuntimeDiagnostic) => void,
  ) => () => void;
}>;

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toMatchFlagsView = (value: FlagsView | undefined) =>
  value ? { map: { ...value.map }, list: [...value.list] } : undefined;

function snapshot<T>(value: T): T {
  return structuredClone(value);
}

function readonlyReference<T>(value: T): T {
  if (!isObject(value)) {
    return value;
  }

  const base: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    base[key] = readonlyReference(nested);
  }

  return new Proxy(base, {
    set() {
      throw new Error("read-only reference");
    },
    deleteProperty() {
      throw new Error("read-only reference");
    },
    defineProperty() {
      throw new Error("read-only reference");
    },
    setPrototypeOf() {
      throw new Error("read-only reference");
    },
    preventExtensions() {
      throw new Error("read-only reference");
    },
  }) as T;
}

function measureEntryBytes(entry: ImpulseQEntryCanonical): number {
  return JSON.stringify(entry).length;
}

/**
 * Creates a Runtime instance as defined by the Runtime Spec.
 */
export function createRuntime(): Runtime {
  const expressionRegistry = registry<RegisteredExpression>();
  const diagnostics = createDiagnosticCollector<RuntimeDiagnostic>();

  let defaults: Defaults = globalDefaults;
  let flagsTruth: FlagsView = createFlagsView([]);
  let changedFlags: FlagsView | undefined;
  let seenFlags: FlagsView = createFlagsView([]);

  let signal: string | undefined;
  let seenSignals: SeenSignals = { list: [], map: {} };

  let backfillQ = createBackfillQ<RegisteredExpression>();

  const impulseQ: {
    q: { entries: ImpulseQEntryCanonical[]; cursor: number };
    config: { retain: number | boolean; maxBytes: number };
  } = {
    q: { entries: [], cursor: 0 },
    config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
  };

  let draining = false;
  let trimPendingMaxBytes = false;
  let runtimeStackDepth = 0;

  const withRuntimeStack = <T>(fn: () => T): T => {
    runtimeStackDepth += 1;
    try {
      return fn();
    } finally {
      runtimeStackDepth -= 1;
      if (runtimeStackDepth === 0 && trimPendingMaxBytes) {
        const trimmed = trim({
          entries: impulseQ.q.entries,
          cursor: impulseQ.q.cursor,
          retain: impulseQ.config.retain,
          maxBytes: impulseQ.config.maxBytes,
          runtimeStackActive: false,
          trimPendingMaxBytes,
          measureBytes: measureEntryBytes,
        });
        impulseQ.q.entries = [...trimmed.entries];
        impulseQ.q.cursor = trimmed.cursor;
        trimPendingMaxBytes = trimmed.trimPendingMaxBytes;
      }
    }
  };

  const runtimeCore: RuntimeCore = {
    get(key, opts) {
      return runtime.get(key, opts);
    },
    matchExpression(opts) {
      return runtime.matchExpression(opts);
    },
  };

  const coreRun = (
    expression: RegisteredExpression,
  ): {
    status: "deploy" | "reject";
    debtDelta?: { signal?: number; flags?: number };
  } => {
    const coreReference: {
      signal?: string;
      flags?: { map: Record<string, true>; list?: string[] };
      changedFlags?: { map: Record<string, true>; list?: string[] };
    } = {};

    if (signal !== undefined) {
      coreReference.signal = signal;
    }

    const coreFlagsView = toMatchFlagsView(flagsTruth);
    if (coreFlagsView !== undefined) {
      coreReference.flags = coreFlagsView;
    }

    const coreChangedFlagsView = toMatchFlagsView(changedFlags);
    if (coreChangedFlagsView !== undefined) {
      coreReference.changedFlags = coreChangedFlagsView;
    }

    const matched = runMatchExpression({
      expression,
      defaults,
      reference: coreReference,
    });

    if (!matched) {
      return { status: "reject", debtDelta: { signal: 1, flags: 1 } };
    }

    const actualExpression: RuntimeOccurrence = {
      ...(signal !== undefined ? { signal } : {}),
      flags: flagsTruth,
      changedFlags: changedFlags ?? createFlagsView([]),
      addFlags: [],
      removeFlags: [],
    };

    for (const target of expression.targets) {
      const targetKind = typeof target === "function" ? "callback" : "object";
      dispatch({
        targetKind,
        target,
        ...(signal !== undefined ? { signal } : {}),
        args: [expression, actualExpression, runtimeCore],
      });
    }

    return { status: "deploy" };
  };

  const runBackfill = (): void => {
    backfillRun({
      backfillQ,
      registeredById: expressionRegistry.registeredById,
      attempt(expression) {
        return {
          status: coreRun(expression).status,
          pending: false,
        };
      },
    });
  };

  const processImpulseEntry = (entry: ImpulseQEntryCanonical): void => {
    const before = flagsTruth;
    const nextMap: Record<string, true> = { ...before.map };

    for (const flag of entry.removeFlags) {
      delete nextMap[flag];
    }

    for (const flag of entry.addFlags) {
      nextMap[flag] = true;
    }

    flagsTruth = createFlagsView(Object.keys(nextMap));
    changedFlags = computeChangedFlags(
      before,
      flagsTruth,
      entry.removeFlags,
      entry.addFlags,
    );
    seenFlags = createFlagsView([...seenFlags.list, ...flagsTruth.list]);

    signal = projectSignal(entry.signals);
    seenSignals = extendSeenSignals(seenSignals, entry.signals);

    const isEmptyImpulse =
      entry.signals.length === 0 && changedFlags.list.length === 0;
    if (isEmptyImpulse) {
      return;
    }

    actImpulse({
      entry,
      hasBackfill: backfillQ.list.length > 0,
      runBackfill: () => {
        runBackfill();
      },
      runRegistered: () => {
        registeredRun({
          registeredQ: expressionRegistry.registeredQ,
          registeredById: expressionRegistry.registeredById,
          backfillQ,
          matchExpression: (expression) => {
            const reference: {
              signal?: string;
              flags?: { map: Record<string, true>; list?: string[] };
              changedFlags?: { map: Record<string, true>; list?: string[] };
            } = {};

            if (signal !== undefined) {
              reference.signal = signal;
            }

            const flagsView = toMatchFlagsView(flagsTruth);
            if (flagsView !== undefined) {
              reference.flags = flagsView;
            }

            const changedFlagsView = toMatchFlagsView(changedFlags);
            if (changedFlagsView !== undefined) {
              reference.changedFlags = changedFlagsView;
            }

            return runMatchExpression({
              expression,
              defaults,
              reference,
            });
          },
          coreRun,
        });
      },
    });
  };

  const runtime: Runtime = {
    add(opts) {
      return withRuntimeStack(() => {
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

        for (const [index, sig] of signals.entries()) {
          const id = signals.length > 1 ? `${baseId}:${index}` : baseId;
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
            ...(hasOwn(source, "backfill")
              ? {
                  backfill: source.backfill as NonNullable<
                    RegisteredExpression["backfill"]
                  >,
                }
              : {}),
            targets,
          });
          ids.push(id);
        }

        return {
          ids,
          remove() {
            for (const id of ids) {
              expressionRegistry.remove(id);
            }
          },
        };
      });
    },

    impulse(opts) {
      withRuntimeStack(() => {
        const entry = canonImpulseEntry(opts);
        if (entry === undefined) {
          diagnostics.emit({
            code: "impulse.input.invalid",
            message: "Invalid impulse payload.",
            severity: "error",
          });
          return;
        }

        impulseQ.q.entries.push(entry);

        const result = drain({
          entries: impulseQ.q.entries,
          cursor: impulseQ.q.cursor,
          draining,
          process: processImpulseEntry,
          onAbort: () => undefined,
        });

        draining = result.draining;
        if (!result.aborted) {
          impulseQ.q.cursor = result.cursor;
        }
      });
    },

    get(key, opts) {
      const resolvedKey = key ?? "*";
      return withRuntimeStack(() => {
        const as = opts?.as ?? "snapshot";

        const valueByKey: Record<string, unknown> = {
          defaults,
          flags: flagsTruth,
          changedFlags,
          seenFlags,
          signal,
          seenSignals,
          impulseQ,
          backfillQ: toBackfillQSnapshot(backfillQ),
          registeredQ: expressionRegistry.registeredQ,
          diagnostics: diagnostics.list(),
          "*": {
            defaults,
            flags: flagsTruth,
            changedFlags,
            seenFlags,
            signal,
            seenSignals,
            impulseQ,
            backfillQ: toBackfillQSnapshot(backfillQ),
            registeredQ: expressionRegistry.registeredQ,
          },
        };

        const selected = valueByKey[resolvedKey] ?? valueByKey["*"];
        if (as === "reference") {
          return readonlyReference(selected);
        }

        return snapshot(selected);
      });
    },

    set(patch) {
      withRuntimeStack(() => {
        if (!isObject(patch)) {
          throw new Error("set.patch.invalid");
        }

        const isHydration = hasOwn(patch, "backfillQ");

        if (isHydration) {
          const hydration = patch as {
            defaults?: Defaults;
            flags?: FlagsView;
            changedFlags?: FlagsView;
            seenFlags?: FlagsView;
            signal?: string;
            seenSignals?: SeenSignals;
            impulseQ?: {
              q?: { entries?: ImpulseQEntryCanonical[]; cursor?: number };
              config?: { retain?: number | boolean; maxBytes?: number };
            };
            backfillQ?: BackfillQSnapshot;
          };

          if (hydration.defaults) defaults = hydration.defaults;
          if (hydration.flags) flagsTruth = hydration.flags;
          if (hasOwn(hydration, "changedFlags"))
            changedFlags = hydration.changedFlags;
          if (hydration.seenFlags) seenFlags = hydration.seenFlags;
          if (hasOwn(hydration, "signal")) signal = hydration.signal;
          if (hydration.seenSignals) seenSignals = hydration.seenSignals;
          if (hydration.impulseQ?.q?.entries)
            impulseQ.q.entries = hydration.impulseQ.q.entries;
          if (typeof hydration.impulseQ?.q?.cursor === "number")
            impulseQ.q.cursor = hydration.impulseQ.q.cursor;
          if (hasOwn(hydration.impulseQ?.config ?? {}, "retain"))
            impulseQ.config.retain = hydration.impulseQ?.config?.retain ?? 0;
          if (typeof hydration.impulseQ?.config?.maxBytes === "number")
            impulseQ.config.maxBytes = hydration.impulseQ.config.maxBytes;

          if (hydration.backfillQ) {
            backfillQ = createBackfillQ();
            for (const id of hydration.backfillQ.list) {
              const expression = expressionRegistry.resolve(id);
              if (expression) {
                backfillQ.list.push(expression);
                backfillQ.map[id] = true;
              }
            }
          }

          return;
        }

        if (
          hasOwn(patch, "changedFlags") ||
          hasOwn(patch, "seenFlags") ||
          hasOwn(patch, "signal") ||
          hasOwn(patch, "seenSignals")
        ) {
          throw new Error("set.patch.forbidden");
        }

        if (
          hasOwn(patch, "flags") &&
          (hasOwn(patch, "addFlags") || hasOwn(patch, "removeFlags"))
        ) {
          throw new Error("set.patch.flags.conflict");
        }

        if (hasOwn(patch, "flags")) {
          const incoming = patch.flags;
          if (
            !isObject(incoming) ||
            !Array.isArray(incoming.list) ||
            !isObject(incoming.map)
          ) {
            throw new Error("set.patch.flags.invalid");
          }
          flagsTruth = createFlagsView(incoming.list as string[]);
        }

        if (hasOwn(patch, "addFlags") || hasOwn(patch, "removeFlags")) {
          const addFlags = Array.isArray(patch.addFlags) ? patch.addFlags : [];
          const removeFlags = Array.isArray(patch.removeFlags)
            ? patch.removeFlags
            : [];

          const before = flagsTruth;
          const map = { ...before.map };
          for (const flag of removeFlags) delete map[String(flag)];
          for (const flag of addFlags) map[String(flag)] = true;
          flagsTruth = createFlagsView(Object.keys(map));
          changedFlags = computeChangedFlags(
            before,
            flagsTruth,
            removeFlags as string[],
            addFlags as string[],
          );
          seenFlags = createFlagsView([...seenFlags.list, ...flagsTruth.list]);
        }

        if (hasOwn(patch, "defaults")) {
          defaults = setDefaults(defaults, patch.defaults as SetDefaults);
        }

        if (hasOwn(patch, "impulseQ")) {
          const impulsePatch = patch.impulseQ;
          if (!isObject(impulsePatch)) {
            throw new Error("set.patch.impulseQ.invalid");
          }

          if (hasOwn(impulsePatch, "q")) {
            throw new Error("set.patch.impulseQ.q.forbidden");
          }

          if (isObject(impulsePatch.config)) {
            if (hasOwn(impulsePatch.config, "retain")) {
              impulseQ.config.retain = impulsePatch.config.retain as
                | number
                | boolean;
            }
            if (hasOwn(impulsePatch.config, "maxBytes")) {
              impulseQ.config.maxBytes = Number(impulsePatch.config.maxBytes);
            }

            const trimmed = trim({
              entries: impulseQ.q.entries,
              cursor: impulseQ.q.cursor,
              retain: impulseQ.config.retain,
              maxBytes: impulseQ.config.maxBytes,
              runtimeStackActive: runtimeStackDepth > 0,
              trimPendingMaxBytes,
              measureBytes: measureEntryBytes,
            });

            impulseQ.q.entries = [...trimmed.entries];
            impulseQ.q.cursor = trimmed.cursor;
            trimPendingMaxBytes = trimmed.trimPendingMaxBytes;
          }
        }
      });
    },

    matchExpression(input) {
      return withRuntimeStack(() => runMatchExpression(input));
    },

    onDiagnostic(handler) {
      return withRuntimeStack(() => {
        const prev = diagnostics.list();
        diagnostics.clear();
        for (const item of prev) {
          handler(item);
          diagnostics.emit(item);
        }

        return () => undefined;
      });
    },
  };

  return runtime;
}
