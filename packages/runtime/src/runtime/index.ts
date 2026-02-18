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
  type DispatchOnErrorMode,
} from "../targets/dispatch.js";
import { hasOwn, isObject, toMatchFlagsView } from "./util.js";
import { initRuntimeStore } from "./store.js";
import { applyRuntimeOnError } from "./onError.js";
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
    runs?: { max: number };
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
  let store = initRuntimeStore<RegisteredExpression>();
  const diagnostics = createDiagnosticCollector<RuntimeDiagnostic>({
    onListenerError: ({ error }) => {
      applyRuntimeOnError(
        store.onError,
        {
          error,
          code: "diagnostic.listener.error",
          phase: "diagnostic/listener",
          message:
            error instanceof Error
              ? error.message
              : "Diagnostic listener failed.",
        },
        (issue) => {
          diagnostics.emit({
            code: issue.code,
            message: issue.message,
            severity: "error",
            data: {
              phase: issue.phase,
            },
          });
        },
      );
    },
  });

  store = initRuntimeStore<RegisteredExpression>({
    reportError: (issue) => {
      diagnostics.emit({
        code: issue.code,
        message: issue.message,
        severity: "error",
        data: {
          phase: issue.phase,
          ...(issue.data !== undefined ? issue.data : {}),
        },
      });
    },
  });

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
  };

  type RunOccurrenceContext = {
    signal?: string;
    changedFlags: Parameters<typeof coreRunImpl>[0]["store"]["changedFlags"];
    addFlags: readonly string[];
    removeFlags: readonly string[];
    occurrenceHasPayload: boolean;
    payload?: unknown;
  };

  let runOccurrenceContext: RunOccurrenceContext = {
    changedFlags: undefined,
    addFlags: [],
    removeFlags: [],
    occurrenceHasPayload: false,
  };

  const toCoreStoreView = (): Parameters<typeof coreRunImpl>[0]["store"] => ({
    flagsTruth: store.flagsTruth,
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
    diagnostics.emit({
      code: "target.error",
      message: issue.error.message,
      severity: "error",
      data: {
        phase: issue.context.phase,
        targetKind: issue.context.targetKind,
        ...(issue.context.handler !== undefined
          ? { handler: issue.context.handler }
          : {}),
      },
    });
  };

  const coreRun = (expression: RegisteredExpression) =>
    coreRunImpl({
      expression,
      store: toCoreStoreView(),
      runtimeCore,
      dispatch: (x: unknown) => {
        const mode = store.onError;
        dispatch({
          ...(x as DispatchInput),
          onError:
            typeof mode === "function"
              ? (dispatchIssue) => {
                  mode(dispatchIssue.error);
                }
              : (mode satisfies DispatchOnErrorMode),
          reportError: reportDispatchIssue,
        });
      },
      matchExpression: matchExpressionForCoreRun,
      toMatchFlagsView,
      createFlagsView,
    });

  const runBackfill = (): void => {
    backfillRun({
      backfillQ: store.backfillQ,
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
    const before = store.flagsTruth;
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

    const toOccurrenceContext = (
      occurrence: ActOccurrence,
    ): RunOccurrenceContext => ({
      ...(occurrence.signal !== undefined ? { signal: occurrence.signal } : {}),
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
    });

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
          runBackfill();
        });
      },
      runRegistered: (occurrence) => {
        withOccurrenceContext(occurrence, () => {
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

              const flagsView = toMatchFlagsView(store.flagsTruth);
              if (flagsView !== undefined) {
                reference.flags = flagsView;
              }

              const changedFlagsView = toMatchFlagsView(
                runOccurrenceContext.changedFlags,
              );
              if (changedFlagsView !== undefined) {
                reference.changedFlags = changedFlagsView;
              }

              return runMatchExpression({
                expression: toMatcherExpression(expression),
                defaults: store.defaults,
                reference,
              });
            },
            coreRun,
          });
        });
      },
    });

    expressionRegistry.compact();
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
      };

      return runAdd(store, addDeps, opts);
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
