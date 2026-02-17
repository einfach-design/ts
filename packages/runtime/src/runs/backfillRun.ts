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
    maxIterations?: number;
    attempt: (
      expression: TExpression,
      gate: RunGate,
    ) => BackfillRunAttemptResult;
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

  const workingQ = opts.backfillQ.list.slice();
  const pendingIds = new Set<string>();

  const reset = resetBackfillQ<TExpression>();
  opts.backfillQ.list = reset.list;
  opts.backfillQ.map = reset.map;

  let iterations = 0;
  let attempts = 0;
  let deployed = 0;
  let cursor = 0;

  while (cursor < workingQ.length) {
    if (opts.maxIterations !== undefined && iterations >= opts.maxIterations) {
      throw new Error(
        `backfillRun exceeded maxIterations (${opts.maxIterations}).`,
      );
    }

    const queuedExpression = workingQ[cursor] as TExpression;
    cursor += 1;
    iterations += 1;

    const liveExpression = opts.registeredById.get(queuedExpression.id);

    if (liveExpression === undefined) {
      pendingIds.delete(queuedExpression.id);
      continue;
    }

    if (liveExpression.tombstone === true) {
      pendingIds.delete(liveExpression.id);
      continue;
    }

    const primary = choosePrimaryGate(liveExpression);
    const primaryResult = opts.attempt(liveExpression, primary);
    attempts += 1;

    if (primaryResult.status === "deploy") {
      deployed += 1;
      if (primaryResult.pending) {
        workingQ.push(liveExpression);
        pendingIds.add(liveExpression.id);
      } else {
        pendingIds.delete(liveExpression.id);
      }
      continue;
    }

    const secondary = oppositeGate(primary);
    const secondaryResult = opts.attempt(liveExpression, secondary);
    attempts += 1;

    if (secondaryResult.status === "deploy") {
      deployed += 1;
      if (secondaryResult.pending) {
        workingQ.push(liveExpression);
        pendingIds.add(liveExpression.id);
      } else {
        pendingIds.delete(liveExpression.id);
      }
    } else if (secondaryResult.pending) {
      pendingIds.add(liveExpression.id);
    } else {
      pendingIds.delete(liveExpression.id);
    }
  }

  let reEnqueued = 0;
  for (const id of pendingIds) {
    const expression = opts.registeredById.get(id);
    if (expression === undefined || expression.tombstone === true) {
      continue;
    }

    appendIfAbsent(opts.backfillQ, expression);
    reEnqueued += 1;
  }

  return {
    iterations,
    attempts,
    deployed,
    reEnqueued,
  };
}
