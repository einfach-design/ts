/**
 * @file packages/runtime/src/runtime.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Runtime public API facade and core wiring.
 */

import { type FlagSpecInput } from "../canon/flagSpecInput.js";
import { type ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import {
  createDiagnosticCollector,
  type RuntimeDiagnostic,
} from "../diagnostics/index.js";
import {
  matchExpression as runMatchExpression,
  type FlagSpec,
  type MatchExpressionInput,
} from "../match/matchExpression.js";
import { actImpulse } from "../processing/actImpulse.js";
import { backfillRun } from "../runs/backfillRun.js";
import { registeredRun } from "../runs/registeredRun.js";
import { computeChangedFlags } from "../state/changedFlags.js";
import { createFlagsView } from "../state/flagsView.js";
import { registry } from "../state/registry.js";
import { extendSeenSignals, projectSignal } from "../state/signals.js";
import {
  dispatch,
  type DispatchError,
  type DispatchInput,
} from "../targets/dispatch.js";
import { hasOwn, isObject, toMatchFlagsView } from "./util.js";
import { initRuntimeStore } from "./store.js";
import {
  coreRun as coreRunImpl,
  type RegisteredExpression,
  type RuntimeCore,
  type RuntimeTarget,
} from "../runs/coreRun.js";
import { runAdd } from "./api/add.js";
import { runGet } from "./api/get.js";
import { runImpulse } from "./api/impulse.js";
import { runMatchExpression as runMatchExpressionApi } from "./api/matchExpression.js";
import { runOnDiagnostic } from "./api/onDiagnostic.js";
import { runSet } from "./api/set.js";
import type { ActOccurrence } from "../processing/actImpulse.js";

type RuntimeAddBackfillInput = {
  signal?: { debt?: number; runs?: { max?: number } };
  flags?: { debt?: number; runs?: { max?: number } };
};

type Runtime = Readonly<{
  add: (opts: {
    id?: string;
    signal?: string;
    signals?: readonly string[];
    flags?: FlagSpecInput;
    required?: { flags?: { min?: number; max?: number; changed?: number } };
    target?: RuntimeTarget;
    targets?: readonly RuntimeTarget[];
    backfill?: RuntimeAddBackfillInput;
    runs?: { max: number };
    onError?: "throw" | "report" | "swallow" | ((error: unknown) => void);
    retroactive?: boolean;
  }) => () => void;
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

const isFlagSpecValue = (value: unknown): value is FlagSpec["value"] =>
  value === true || value === false || value === "*";

const isFlagSpec = (value: unknown): value is FlagSpec => {
  if (!isObject(value)) return false;
  if (!hasOwn(value, "flag") || typeof value.flag !== "string") return false;
  if (!hasOwn(value, "value")) return false;
  return isFlagSpecValue(value.value);
};

const toFlagSpecList = (value: unknown): FlagSpec[] | undefined =>
  Array.isArray(value) && value.every(isFlagSpec) ? value : undefined;

const toMatcherExpression = (
  expression: RegisteredExpression,
): Parameters<typeof runMatchExpression>[0]["expression"] => {
  const base: Parameters<typeof runMatchExpression>[0]["expression"] = {};

  if (expression.signal !== undefined) {
    base.signal = expression.signal;
  }

  const flags = toFlagSpecList(expression.flags);
  if (flags !== undefined) {
    base.flags = flags;
  }

  if (expression.required !== undefined) {
    base.required = expression.required;
  }

  return base;
};

/**
 * Creates a Runtime instance as defined by the Runtime Spec.
 */
export function createRuntime(): Runtime {
  const expressionRegistry = registry<RegisteredExpression>();
  const store = initRuntimeStore<RegisteredExpression>();

  let handlingDiagnosticListenerError = false;

  const diagnostics = createDiagnosticCollector<RuntimeDiagnostic>({
    onListenerError: ({ error, listenerIndex, handlerName }): void => {
      if (handlingDiagnosticListenerError) {
        return;
      }

      handlingDiagnosticListenerError = true;
      try {
        store.reportRuntimeError(error, "diagnostic/listener", {
          listenerIndex,
          ...(handlerName !== undefined ? { handlerName } : {}),
        });
      } finally {
        handlingDiagnosticListenerError = false;
      }
    },
  });

  store.diagnostics = diagnostics;

  const runtimeCore: RuntimeCore = {
    get(key, opts) {
      return runtime.get(
        key as string | undefined,
        opts as { as?: "snapshot" | "reference"; scope?: string } | undefined,
      );
    },
    matchExpression(opts) {
      return runtime.matchExpression(opts as MatchExpressionInput);
    },
    remove(id) {
      return expressionRegistry.remove(id as string);
    },
  };

  type ExpressionTelemetry = {
    backfillSignalRuns?: number;
    backfillFlagsRuns?: number;
    inBackfillQ?: boolean;
  };

  type RunOccurrenceContext = {
    signal?: string;
    referenceFlags: Parameters<
      typeof coreRunImpl
    >[0]["store"]["referenceFlags"];
    changedFlags: Parameters<typeof coreRunImpl>[0]["store"]["changedFlags"];
    addFlags: readonly string[];
    removeFlags: readonly string[];
    occurrenceHasPayload: boolean;
    payload?: unknown;
    occurrenceSeq: number;
    occurrenceId: string;
    expressionTelemetryById: Map<string, ExpressionTelemetry>;
    currentBackfillGate?: "signal" | "flags";
    skipRegisteredById: Set<string>;
  };

  let nextOccurrenceSeq = 0;

  let runOccurrenceContext: RunOccurrenceContext = {
    referenceFlags: createFlagsView([]),
    changedFlags: undefined,
    addFlags: [],
    removeFlags: [],
    occurrenceHasPayload: false,
    occurrenceSeq: 0,
    occurrenceId: "occ:0",
    expressionTelemetryById: new Map(),
    skipRegisteredById: new Set(),
  };

  const toCoreStoreView = (): Parameters<typeof coreRunImpl>[0]["store"] => ({
    flagsTruth: store.flagsTruth,
    referenceFlags: runOccurrenceContext.referenceFlags,
    defaults: store.defaults,
    ...(runOccurrenceContext.signal !== undefined
      ? { signal: runOccurrenceContext.signal }
      : {}),
    ...(runOccurrenceContext.changedFlags !== undefined
      ? { changedFlags: runOccurrenceContext.changedFlags }
      : {}),
    addFlags: runOccurrenceContext.addFlags,
    removeFlags: runOccurrenceContext.removeFlags,
    occurrenceHasPayload: runOccurrenceContext.occurrenceHasPayload,
    ...(runOccurrenceContext.occurrenceHasPayload
      ? { payload: runOccurrenceContext.payload }
      : {}),
    occurrenceSeq: runOccurrenceContext.occurrenceSeq,
    occurrenceId: runOccurrenceContext.occurrenceId,
    expressionTelemetryById: runOccurrenceContext.expressionTelemetryById,
    ...(runOccurrenceContext.currentBackfillGate !== undefined
      ? { currentBackfillGate: runOccurrenceContext.currentBackfillGate }
      : {}),
  });

  const matchExpressionForCoreRun: Parameters<
    typeof coreRunImpl
  >[0]["matchExpression"] = (input) =>
    runMatchExpression({
      expression: toMatcherExpression(input.expression),
      defaults: input.defaults as MatchExpressionInput["defaults"],
      reference: input.reference,
    });

  const reportDispatchIssue = (issue: DispatchError): void => {
    store.reportRuntimeError(
      issue.error,
      issue.context.phase,
      {
        targetKind: issue.context.targetKind,
        ...(issue.context.handler !== undefined
          ? { handler: issue.context.handler }
          : {}),
        ...(issue.context.signal !== undefined
          ? { signal: issue.context.signal }
          : {}),
        ...(issue.context.expressionId !== undefined
          ? { expressionId: issue.context.expressionId }
          : {}),
        ...(issue.context.occurrenceKind !== undefined
          ? { occurrenceKind: issue.context.occurrenceKind }
          : {}),
      },
      "report",
    );
  };

  const exitExpressionOnLimit = (expression: { id: string }): void => {
    expressionRegistry.remove(expression.id);
  };

  const dispatchForCoreRun: Parameters<typeof coreRunImpl>[0]["dispatch"] = (
    x,
  ) =>
    dispatch({
      ...(x as Omit<DispatchInput, "reportError">),
      reportError: reportDispatchIssue,
    });

  const reportRunsLimitReached = (expression: {
    id: string;
    max: number;
  }): void => {
    diagnostics.emit({
      code: "runs.max.exceeded",
      message: `Expression ${expression.id} reached runs.max=${expression.max}.`,
      severity: "warn",
      data: {
        expressionId: expression.id,
        max: expression.max,
      },
    });
  };

  const runCoreExpression = (
    expression: RegisteredExpression,
    occurrenceKind: "registered" | "backfill" = "registered",
    backfillGate?: "signal" | "flags",
    gate?: { signal?: boolean; flags?: boolean },
  ) => {
    const previousGate = runOccurrenceContext.currentBackfillGate;
    if (backfillGate !== undefined) {
      runOccurrenceContext.currentBackfillGate = backfillGate;
    } else {
      delete runOccurrenceContext.currentBackfillGate;
    }

    try {
      return coreRunImpl({
        expression,
        store: toCoreStoreView(),
        runtimeCore,
        dispatch: dispatchForCoreRun,
        matchExpression: matchExpressionForCoreRun,
        toMatchFlagsView,
        createFlagsView,
        onLimitReached: exitExpressionOnLimit,
        onRunsLimitReached: reportRunsLimitReached,
        occurrenceKind,
        ...(gate !== undefined ? { gate } : {}),
      });
    } finally {
      if (previousGate !== undefined) {
        runOccurrenceContext.currentBackfillGate = previousGate;
      } else {
        delete runOccurrenceContext.currentBackfillGate;
      }
    }
  };

  const coreRun = (expression: RegisteredExpression) =>
    runCoreExpression(expression, "registered");

  const isBackfillRelevant = (
    telemetry: ExpressionTelemetry | undefined,
  ): boolean =>
    telemetry?.backfillSignalRuns !== undefined &&
    telemetry.backfillFlagsRuns !== undefined;

  const ensureBackfillTelemetry = (
    telemetryById: Map<string, ExpressionTelemetry>,
    expressionId: string,
  ): ExpressionTelemetry => {
    const existing = telemetryById.get(expressionId);
    if (
      existing !== undefined &&
      existing.backfillSignalRuns !== undefined &&
      existing.backfillFlagsRuns !== undefined
    ) {
      return existing;
    }

    const next: ExpressionTelemetry = {
      backfillSignalRuns: 0,
      backfillFlagsRuns: 0,
    };
    telemetryById.set(expressionId, next);
    return next;
  };

  const expressionHasDebt = (expression: RegisteredExpression): boolean =>
    (expression.backfill?.signal?.debt ?? 0) > 0 ||
    (expression.backfill?.flags?.debt ?? 0) > 0;

  const processImpulseEntry = (entry: ImpulseQEntryCanonical): void => {
    const before = store.flagsTruth;
    const referenceFlags =
      entry.useFixedFlags !== false ? entry.useFixedFlags : before;
    const nextMap: Record<string, true> = { ...before.map };

    const removeSet = new Set(entry.removeFlags);

    for (const flag of entry.removeFlags) {
      delete nextMap[flag];
    }

    for (const flag of entry.addFlags) {
      if (removeSet.has(flag)) continue;
      nextMap[flag] = true;
    }

    store.flagsTruth = createFlagsView(Object.keys(nextMap));
    store.changedFlags = computeChangedFlags(
      before,
      store.flagsTruth,
      entry.removeFlags,
      entry.addFlags,
    );
    store.seenFlags = createFlagsView([
      ...store.seenFlags.list,
      ...store.flagsTruth.list,
    ]);

    store.signal = projectSignal(entry.signals);
    store.seenSignals = extendSeenSignals(store.seenSignals, entry.signals);

    const isEmptyImpulse =
      entry.signals.length === 0 && store.changedFlags.list.length === 0;
    if (isEmptyImpulse) {
      return;
    }

    const impulseTelemetryById = new Map<string, ExpressionTelemetry>();
    const skipRegisteredById = new Set<string>();

    const toOccurrenceContext = (
      occurrence: ActOccurrence,
    ): RunOccurrenceContext => {
      nextOccurrenceSeq += 1;
      return {
        ...(occurrence.signal !== undefined
          ? { signal: occurrence.signal }
          : {}),
        referenceFlags,
        changedFlags: store.changedFlags,
        addFlags: entry.addFlags,
        removeFlags: entry.removeFlags,
        occurrenceHasPayload: Object.prototype.hasOwnProperty.call(
          occurrence,
          "payload",
        ),
        ...(Object.prototype.hasOwnProperty.call(occurrence, "payload")
          ? { payload: occurrence.payload }
          : {}),
        occurrenceSeq: nextOccurrenceSeq,
        occurrenceId: `occ:${nextOccurrenceSeq}`,
        expressionTelemetryById: impulseTelemetryById,
        skipRegisteredById,
      };
    };

    const withOccurrenceContext = (
      occurrence: ActOccurrence,
      runner: () => void,
    ): void => {
      const previous = runOccurrenceContext;
      runOccurrenceContext = toOccurrenceContext(occurrence);

      try {
        runner();
      } finally {
        runOccurrenceContext = previous;
      }
    };

    actImpulse({
      entry,
      hasBackfill: store.backfillQ.list.length > 0,
      runBackfill: (occurrence) => {
        withOccurrenceContext(occurrence, () => {
          backfillRun({
            backfillQ: store.backfillQ,
            registeredById: expressionRegistry.registeredById,
            attempt(expression, gate) {
              // Deterministic guard: a flags-gated backfill attempt with no changed flags
              // must reject early even when the signal matches, so gate semantics stay stable.
              // This preserves reject/no-reenqueue invariants from spec sections 7.2.1 and 9.6.
              if (
                gate === "flags" &&
                (runOccurrenceContext.changedFlags?.list.length ?? 0) === 0 &&
                expression.required?.flags?.changed !== undefined &&
                expression.signal !== undefined &&
                expression.signal === runOccurrenceContext.signal
              ) {
                runCoreExpression(expression, "backfill", "flags", {
                  signal: false,
                });
                runOccurrenceContext.skipRegisteredById.add(expression.id);

                return {
                  status: "reject",
                  pending: expressionHasDebt(expression),
                  consumedDebt: false,
                  halt: true,
                };
              }

              if (expressionHasDebt(expression)) {
                ensureBackfillTelemetry(
                  runOccurrenceContext.expressionTelemetryById,
                  expression.id,
                );
              }

              const result = runCoreExpression(
                expression,
                "backfill",
                gate,
                gate === "signal" ? { flags: false } : { signal: false },
              );
              if (result.status === "deploy") {
                const current = ensureBackfillTelemetry(
                  runOccurrenceContext.expressionTelemetryById,
                  expression.id,
                );
                runOccurrenceContext.expressionTelemetryById.set(
                  expression.id,
                  {
                    ...current,
                    ...(gate === "signal"
                      ? {
                          backfillSignalRuns:
                            (current.backfillSignalRuns ?? 0) + 1,
                        }
                      : {
                          backfillFlagsRuns:
                            (current.backfillFlagsRuns ?? 0) + 1,
                        }),
                  },
                );
              }

              return {
                status: result.status,
                pending: expressionHasDebt(expression),
                consumedDebt: result.status === "deploy",
              };
            },
            onLimitReached: exitExpressionOnLimit,
            onEnqueue: (expressionId) => {
              const current = ensureBackfillTelemetry(
                runOccurrenceContext.expressionTelemetryById,
                expressionId,
              );
              runOccurrenceContext.expressionTelemetryById.set(expressionId, {
                ...current,
                inBackfillQ: true,
              });
            },
          });
        });
      },
      runRegistered: (occurrence) => {
        withOccurrenceContext(occurrence, () => {
          for (const [
            expressionId,
            telemetry,
          ] of runOccurrenceContext.expressionTelemetryById.entries()) {
            if (!isBackfillRelevant(telemetry)) {
              continue;
            }

            if (telemetry.inBackfillQ === undefined) {
              runOccurrenceContext.expressionTelemetryById.set(expressionId, {
                ...telemetry,
                inBackfillQ: false,
              });
            }
          }

          for (const expression of expressionRegistry.registeredQ) {
            const current = runOccurrenceContext.expressionTelemetryById.get(
              expression.id,
            );
            const isInBackfillQ = store.backfillQ.map[expression.id] === true;

            // Safety rule: do not create telemetry entries for non-backfill-relevant expressions.
            if (current === undefined && !isInBackfillQ) {
              continue;
            }

            runOccurrenceContext.expressionTelemetryById.set(expression.id, {
              ...(current ?? {}),
              inBackfillQ: isInBackfillQ,
            });
          }

          registeredRun({
            registeredQ: expressionRegistry.registeredQ,
            registeredById: expressionRegistry.registeredById,
            backfillQ: store.backfillQ,
            matchExpression: (expression) => {
              const reference: {
                signal?: string;
                flags?: { map: Record<string, true>; list?: string[] };
                changedFlags?: { map: Record<string, true>; list?: string[] };
              } = {};

              if (runOccurrenceContext.signal !== undefined) {
                reference.signal = runOccurrenceContext.signal;
              }

              const flagsView = toMatchFlagsView(
                runOccurrenceContext.referenceFlags,
              );
              if (flagsView !== undefined) {
                reference.flags = flagsView;
              }

              const changedFlagsView = toMatchFlagsView(
                runOccurrenceContext.changedFlags,
              );
              if (changedFlagsView !== undefined) {
                reference.changedFlags = changedFlagsView;
              }

              if (runOccurrenceContext.skipRegisteredById.has(expression.id)) {
                return false;
              }

              return runMatchExpression({
                expression: toMatcherExpression(expression),
                defaults: store.defaults,
                reference,
              });
            },
            coreRun,
            onEnqueue: (expressionId) => {
              const current = ensureBackfillTelemetry(
                runOccurrenceContext.expressionTelemetryById,
                expressionId,
              );
              runOccurrenceContext.expressionTelemetryById.set(expressionId, {
                ...current,
                inBackfillQ: true,
              });
            },
          });
        });
      },
    });
  };

  const runRetroactiveValidation = (ids: readonly string[]): void => {
    if (ids.length === 0) {
      return;
    }

    const previous = runOccurrenceContext;
    nextOccurrenceSeq += 1;

    try {
      runOccurrenceContext = {
        referenceFlags: store.flagsTruth,
        changedFlags: createFlagsView([]),
        addFlags: [],
        removeFlags: [],
        occurrenceHasPayload: false,
        occurrenceSeq: nextOccurrenceSeq,
        occurrenceId: `occ:${nextOccurrenceSeq}`,
        expressionTelemetryById: new Map(),
        skipRegisteredById: new Set(),
      };

      for (const id of ids) {
        const expression = expressionRegistry.resolve(id);
        if (expression === undefined || expression.tombstone === true) {
          continue;
        }

        if (
          expression.signal !== undefined &&
          store.seenSignals.map[expression.signal] !== true
        ) {
          continue;
        }

        const reference: {
          signal?: string;
          flags: { map: Record<string, true>; list: string[] };
          changedFlags: { map: Record<string, true>; list: string[] };
        } = {
          flags: toMatchFlagsView(runOccurrenceContext.referenceFlags)!,
          changedFlags: { map: {}, list: [] },
        };

        if (expression.signal !== undefined) {
          reference.signal = expression.signal;
          runOccurrenceContext.signal = expression.signal;
        } else {
          delete runOccurrenceContext.signal;
        }

        const matched = runMatchExpression({
          expression: toMatcherExpression(expression),
          defaults: store.defaults,
          reference,
        });

        if (!matched) {
          continue;
        }

        runCoreExpression(expression, "registered");
      }
    } finally {
      runOccurrenceContext = previous;
    }
  };

  const deps = {
    expressionRegistry,
    diagnostics,
    processImpulseEntry,
    runMatchExpression,
  };

  const runtime: Runtime = {
    add(opts) {
      const addDeps = {
        expressionRegistry: deps.expressionRegistry as unknown as Parameters<
          typeof runAdd
        >[1]["expressionRegistry"],
        diagnostics: deps.diagnostics as unknown as Parameters<
          typeof runAdd
        >[1]["diagnostics"],
      };

      const added = runAdd(store, addDeps, opts);
      if (added.retroactive) {
        runRetroactiveValidation(added.ids);
      }
      return added.remove;
    },

    impulse(opts) {
      runImpulse(store, deps, opts);
    },

    get(key, opts) {
      return runGet(store, deps, key, opts);
    },

    set(patch) {
      runSet(store, deps, patch);
    },

    matchExpression(input) {
      return runMatchExpressionApi(store, deps, input);
    },

    onDiagnostic(handler) {
      return runOnDiagnostic(store, deps, handler);
    },
  };

  return runtime;
}
