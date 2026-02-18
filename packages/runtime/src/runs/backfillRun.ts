/**
 * @file packages/runtime/src/runs/backfillRun.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Backfill run processing.
 */

import {
  appendIfAbsent,
  resetBackfillQ,
  type BackfillQ,
} from "../state/backfillQ.js";
import { type RegisteredExpression, type RunGate } from "./registeredRun.js";

export type BackfillRunAttemptResult = Readonly<{
  status: "deploy" | "reject";
  pending: boolean;
  consumedDebt: boolean;
}>;

export type BackfillRunOptions<TExpression extends RegisteredExpression> =
  Readonly<{
    backfillQ: BackfillQ<TExpression>;
    registeredById: ReadonlyMap<string, TExpression>;
    attempt: (
      expression: TExpression,
      gate: RunGate,
    ) => BackfillRunAttemptResult;
    maxIterations?: number;
    onLimitReached?: (expression: { id: string }) => void;
    onEnqueue?: (expressionId: string) => void;
  }>;

export type BackfillRunResult = Readonly<{
  iterations: number;
  attempts: number;
  deployed: number;
  reEnqueued: number;
}>;

function readDebt(expression: RegisteredExpression, gate: RunGate): number {
  return expression.backfill?.[gate]?.debt ?? 0;
}

function writeDebt(
  expression: RegisteredExpression,
  gate: RunGate,
  debt: number,
): void {
  expression.backfill ??= {};
  expression.backfill[gate] ??= {};
  expression.backfill[gate].debt = Math.max(0, debt);
}

function hasPendingDebt(expression: RegisteredExpression): boolean {
  return (
    readDebt(expression, "signal") > 0 || readDebt(expression, "flags") > 0
  );
}

function choosePrimaryGate(expression: RegisteredExpression): RunGate {
  const signalDebt = readDebt(expression, "signal");
  const flagsDebt = readDebt(expression, "flags");

  if (signalDebt >= flagsDebt) {
    return "signal";
  }

  return "flags";
}

function oppositeGate(gate: RunGate): RunGate {
  return gate === "signal" ? "flags" : "signal";
}

function isDeployAllowed(
  expression: RegisteredExpression,
  gate: RunGate,
): boolean {
  const expressionWithRuns = expression as RegisteredExpression & {
    runs?: { used: number; max: number };
  };

  if (
    expressionWithRuns.runs !== undefined &&
    expressionWithRuns.runs.used >= expressionWithRuns.runs.max
  ) {
    return false;
  }

  const gateRuns = expression.backfill?.[gate]?.runs;
  if (gateRuns !== undefined && gateRuns.used >= gateRuns.max) {
    return false;
  }

  return true;
}

function incrementGateRunsAndMaybeTombstone(
  expression: RegisteredExpression,
  gate: RunGate,
  onLimitReached?: (expression: { id: string }) => void,
): void {
  const gateConfig = expression.backfill?.[gate];
  const gateRuns = gateConfig?.runs;

  if (gateRuns === undefined) {
    return;
  }

  gateRuns.used += 1;
  if (gateRuns.used >= gateRuns.max) {
    if (onLimitReached !== undefined) {
      onLimitReached(expression);
    } else {
      expression.tombstone = true;
    }
  }
}

/**
 * Backfill run processing.
 *
 * - Snapshot + hard reset of `backfillQ` at run start.
 * - Outer-loop over `workingQ` (FIFO).
 * - Per iteration: primary (debt-weighted) + optional opposite attempt.
 * - Max one deploy per iteration.
 * - Rotation only on deploy+pending.
 * - Pending entries are re-enqueued at run end.
 */
export function backfillRun<TExpression extends RegisteredExpression>(
  opts: BackfillRunOptions<TExpression>,
): BackfillRunResult {
  if (opts.backfillQ.list.length === 0) {
    return {
      iterations: 0,
      attempts: 0,
      deployed: 0,
      reEnqueued: 0,
    };
  }

  const workingQ: TExpression[] = [];
  const queuedInWorking = new Set<string>();
  for (const expression of opts.backfillQ.list) {
    if (queuedInWorking.has(expression.id)) {
      continue;
    }

    workingQ.push(expression);
    queuedInWorking.add(expression.id);
  }

  const pendingForReenqueue = new Map<string, TExpression>();

  const reset = resetBackfillQ<TExpression>();
  opts.backfillQ.list = reset.list;
  opts.backfillQ.map = reset.map;

  let iterations = 0;
  let attempts = 0;
  let deployed = 0;

  for (let index = 0; index < workingQ.length; index += 1) {
    if (
      opts.maxIterations !== undefined &&
      Number.isFinite(opts.maxIterations) &&
      iterations >= opts.maxIterations
    ) {
      throw new Error(
        `backfillRun exceeded configured maxIterations (${opts.maxIterations}).`,
      );
    }

    const queuedExpression = workingQ[index] as TExpression;
    queuedInWorking.delete(queuedExpression.id);
    iterations += 1;

    const liveExpression =
      opts.registeredById.get(queuedExpression.id) ?? queuedExpression;

    if (liveExpression.tombstone === true) {
      pendingForReenqueue.delete(liveExpression.id);
      continue;
    }

    const primary = choosePrimaryGate(liveExpression);

    const runAttempt = (gate: RunGate): BackfillRunAttemptResult => {
      if (!isDeployAllowed(liveExpression, gate)) {
        return {
          status: "reject",
          pending: hasPendingDebt(liveExpression),
          consumedDebt: false,
        };
      }

      const result = opts.attempt(liveExpression, gate);
      attempts += 1;

      let consumedDebt = false;
      if (result.status === "deploy") {
        deployed += 1;
        const previousDebt = readDebt(liveExpression, gate);
        writeDebt(liveExpression, gate, previousDebt - 1);
        consumedDebt = previousDebt > 0;
        incrementGateRunsAndMaybeTombstone(
          liveExpression,
          gate,
          opts.onLimitReached,
        );
      }

      return {
        status: result.status,
        pending: hasPendingDebt(liveExpression),
        consumedDebt,
      };
    };

    const primaryResult = runAttempt(primary);

    if (liveExpression.tombstone === true) {
      pendingForReenqueue.delete(liveExpression.id);
      continue;
    }

    if (primaryResult.status === "deploy") {
      if (primaryResult.pending && primaryResult.consumedDebt) {
        if (!queuedInWorking.has(liveExpression.id)) {
          workingQ.push(liveExpression);
          queuedInWorking.add(liveExpression.id);
        }

        pendingForReenqueue.set(liveExpression.id, liveExpression);
      } else {
        pendingForReenqueue.delete(liveExpression.id);
      }
      continue;
    }

    const secondary = oppositeGate(primary);
    const secondaryResult = runAttempt(secondary);

    if (liveExpression.tombstone === true) {
      pendingForReenqueue.delete(liveExpression.id);
      continue;
    }

    if (
      secondaryResult.status === "deploy" &&
      secondaryResult.pending &&
      secondaryResult.consumedDebt
    ) {
      if (!queuedInWorking.has(liveExpression.id)) {
        workingQ.push(liveExpression);
        queuedInWorking.add(liveExpression.id);
      }

      pendingForReenqueue.set(liveExpression.id, liveExpression);
    } else if (secondaryResult.pending) {
      pendingForReenqueue.set(liveExpression.id, liveExpression);
    } else {
      pendingForReenqueue.delete(liveExpression.id);
    }
  }

  let reEnqueued = 0;
  for (const expression of pendingForReenqueue.values()) {
    const enqueued = appendIfAbsent(opts.backfillQ, expression);
    if (enqueued) {
      reEnqueued += 1;
      opts.onEnqueue?.(expression.id);
    }
  }

  return {
    iterations,
    attempts,
    deployed,
    reEnqueued,
  };
}
