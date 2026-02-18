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

function incrementGateRunsAndMaybeTombstone(
  expression: RegisteredExpression,
  gate: RunGate,
): void {
  const gateConfig = expression.backfill?.[gate];
  const gateRuns = gateConfig?.runs;

  if (gateRuns === undefined) {
    return;
  }

  gateRuns.used += 1;
  if (gateRuns.used >= gateRuns.max) {
    expression.tombstone = true;
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
    incrementGateRunsAndMaybeTombstone(liveExpression, primary);

    const primaryResult = opts.attempt(liveExpression, primary);
    attempts += 1;

    if (liveExpression.tombstone === true) {
      pendingForReenqueue.delete(liveExpression.id);
      continue;
    }

    if (primaryResult.status === "deploy") {
      deployed += 1;
      if (primaryResult.pending) {
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

    // Spec intent (§9.7/§9.9): a primary reject always performs exactly one
    // opposite attempt in the same iteration. "No retry in this round" means
    // no additional attempts beyond that opposite attempt and no rotation.
    const secondary = oppositeGate(primary);
    incrementGateRunsAndMaybeTombstone(liveExpression, secondary);

    const secondaryResult = opts.attempt(liveExpression, secondary);
    attempts += 1;

    if (liveExpression.tombstone === true) {
      pendingForReenqueue.delete(liveExpression.id);
      continue;
    }

    if (secondaryResult.status === "deploy") {
      deployed += 1;
      if (secondaryResult.pending) {
        if (!queuedInWorking.has(liveExpression.id)) {
          workingQ.push(liveExpression);
          queuedInWorking.add(liveExpression.id);
        }

        pendingForReenqueue.set(liveExpression.id, liveExpression);
      } else {
        pendingForReenqueue.delete(liveExpression.id);
      }
    } else if (secondaryResult.pending) {
      pendingForReenqueue.set(liveExpression.id, liveExpression);
    } else {
      pendingForReenqueue.delete(liveExpression.id);
    }
  }

  let reEnqueued = 0;
  for (const expression of pendingForReenqueue.values()) {
    if (expression.tombstone === true) {
      continue;
    }

    if (appendIfAbsent(opts.backfillQ, expression)) {
      reEnqueued += 1;
    }
  }

  return {
    iterations,
    attempts,
    deployed,
    reEnqueued,
  };
}
