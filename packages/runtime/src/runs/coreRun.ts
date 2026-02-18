/**
 * @file packages/runtime/src/runs/coreRun.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Core run processing, used by backfillRun und registeredRun.
 */

import type { RuntimeOnError } from "../runtime/store.js";
import type { FlagsView } from "../state/flagsView.js";

export type RuntimeOccurrence = Readonly<{
  signal?: string;
  flags: FlagsView;
  changedFlags: FlagsView;
  addFlags: readonly string[];
  removeFlags: readonly string[];
  payload?: unknown;
}>;

export type RuntimeCore = Readonly<{
  get: (...args: unknown[]) => unknown;
  matchExpression: (...args: unknown[]) => unknown;
}>;

export type RegisteredExpression = {
  id: string;
  signal?: string;
  flags?: unknown;
  required?: { flags?: { min?: number; max?: number; changed?: number } };
  targets: RuntimeTarget[];
  onError?: RuntimeOnError;
  backfill?: {
    signal?: { debt?: number; runs?: { used: number; max: number } };
    flags?: { debt?: number; runs?: { used: number; max: number } };
  };
  runs?: { used: number; max: number };
  runsLimitReported?: true;
  tombstone?: true;
};

export type InnerExpressionAbort = Readonly<{
  __runtimeInnerAbort: true;
  error: unknown;
}>;

export const isInnerExpressionAbort = (
  value: unknown,
): value is InnerExpressionAbort =>
  typeof value === "object" &&
  value !== null &&
  "__runtimeInnerAbort" in value &&
  (value as { __runtimeInnerAbort?: unknown }).__runtimeInnerAbort === true;

export type RuntimeTarget =
  | ((i: RuntimeOccurrence, a: RegisteredExpression, r: RuntimeCore) => void)
  | { on: Record<string, unknown> };

export const coreRun = (args: {
  expression: RegisteredExpression;
  store: {
    signal?: string;
    flagsTruth: FlagsView;
    changedFlags?: FlagsView;
    addFlags: readonly string[];
    removeFlags: readonly string[];
    occurrenceHasPayload: boolean;
    payload?: unknown;
    defaults: unknown;
  };
  toMatchFlagsView: (
    v: FlagsView | undefined,
  ) => { map: Record<string, true>; list?: string[] } | undefined;
  createFlagsView: (list: readonly string[]) => FlagsView;
  matchExpression: (input: {
    expression: RegisteredExpression;
    defaults: unknown;
    reference: {
      signal?: string;
      flags?: { map: Record<string, true>; list?: string[] };
      changedFlags?: { map: Record<string, true>; list?: string[] };
    };
  }) => boolean;
  dispatch: (x: unknown) => { attempted: number };
  occurrenceKind?: "registered" | "backfill";
  runtimeCore: RuntimeCore;
  onLimitReached?: (expression: { id: string }) => void;
  onRunsLimitReached?: (expression: { id: string; max: number }) => void;
}): {
  status: "deploy" | "reject";
  debtDelta?: { signal?: number; flags?: number };
} => {
  const {
    expression,
    store,
    toMatchFlagsView,
    createFlagsView,
    matchExpression,
    dispatch,
    runtimeCore,
    onLimitReached,
    onRunsLimitReached,
    occurrenceKind = "registered",
  } = args;

  const coreReference: {
    signal?: string;
    flags?: { map: Record<string, true>; list?: string[] };
    changedFlags?: { map: Record<string, true>; list?: string[] };
  } = {};

  if (store.signal !== undefined) {
    coreReference.signal = store.signal;
  }

  const coreFlagsView = toMatchFlagsView(store.flagsTruth);
  if (coreFlagsView !== undefined) {
    coreReference.flags = coreFlagsView;
  }

  const coreChangedFlagsView = toMatchFlagsView(store.changedFlags);
  if (coreChangedFlagsView !== undefined) {
    coreReference.changedFlags = coreChangedFlagsView;
  }

  const matched = matchExpression({
    expression,
    defaults: store.defaults,
    reference: coreReference,
  });

  if (!matched) {
    return { status: "reject", debtDelta: { signal: 1, flags: 1 } };
  }

  const actualExpression: RuntimeOccurrence = {
    ...(store.signal !== undefined ? { signal: store.signal } : {}),
    flags: store.flagsTruth,
    changedFlags: store.changedFlags ?? createFlagsView([]),
    addFlags: store.addFlags,
    removeFlags: store.removeFlags,
    ...(store.occurrenceHasPayload ? { payload: store.payload } : {}),
  };

  let attempted = 0;

  const resolveOnError = ():
    | RuntimeOnError
    | ((issue: { error: unknown }) => void) => {
    if (expression.onError === "throw") {
      return (issue: { error: unknown }) => {
        throw {
          __runtimeInnerAbort: true,
          error: issue.error,
        } as InnerExpressionAbort;
      };
    }

    const expressionOnError = expression.onError;
    if (typeof expressionOnError === "function") {
      return (issue: { error: unknown }) => {
        try {
          expressionOnError(issue.error);
        } catch (error) {
          throw { __runtimeInnerAbort: true, error } as InnerExpressionAbort;
        }
      };
    }

    return expression.onError ?? "throw";
  };

  for (const target of expression.targets) {
    const targetKind = typeof target === "function" ? "callback" : "object";
    attempted += dispatch({
      targetKind,
      target,
      ...(store.signal !== undefined ? { signal: store.signal } : {}),
      args: [actualExpression, expression, runtimeCore],
      onError: resolveOnError(),
      context: {
        expressionId: expression.id,
        occurrenceKind,
      },
    }).attempted;
  }

  if (expression.runs !== undefined && attempted > 0) {
    expression.runs.used += 1;
    if (expression.runs.used >= expression.runs.max) {
      if (expression.runsLimitReported !== true) {
        expression.runsLimitReported = true;
        onRunsLimitReached?.({ id: expression.id, max: expression.runs.max });
      }

      if (onLimitReached !== undefined) {
        onLimitReached(expression);
      } else {
        expression.tombstone = true;
      }
    }
  }

  return { status: "deploy" };
};
