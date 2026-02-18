/**
 * @file packages/runtime/src/runs/registeredRun.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Registered run processing.
 */

import { appendIfAbsent, type BackfillQ } from "../state/backfillQ.js";

export type RunGate = "signal" | "flags";

export type RegisteredExpression = {
  id: string;
  tombstone?: true;
  backfill?: {
    signal?: { debt?: number; runs?: { used: number; max: number } };
    flags?: { debt?: number; runs?: { used: number; max: number } };
  };
};

export type RegisteredRunAttemptResult = Readonly<{
  status: "deploy" | "reject";
  debtDelta?: Partial<Record<RunGate, number>>;
}>;

export type RegisteredRunOptions<TExpression extends RegisteredExpression> =
  Readonly<{
    registeredQ: readonly TExpression[];
    registeredById: ReadonlyMap<string, TExpression>;
    backfillQ: BackfillQ<TExpression>;
    matchExpression: (expression: TExpression) => boolean;
    coreRun: (expression: TExpression) => RegisteredRunAttemptResult;
  }>;

export type RegisteredRunResult = Readonly<{
  visited: number;
  attempted: number;
  deployed: number;
  rejected: number;
  debtEntries: number;
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
  expression.backfill[gate].debt = debt;
}

/**
 * Registered run processing.
 *
 * - Deterministic iteration over `registeredQ.slice()`.
 * - Tombstones are skipped.
 * - Debt is only allowed to grow here.
 * - Debt-entry transition (`<= 0 -> > 0`) enqueues by id via `appendIfAbsent`.
 */
export function registeredRun<TExpression extends RegisteredExpression>(
  opts: RegisteredRunOptions<TExpression>,
): RegisteredRunResult {
  const snapshot = opts.registeredQ.slice();

  let attempted = 0;
  let deployed = 0;
  let rejected = 0;
  let debtEntries = 0;

  for (const snapshotExpression of snapshot) {
    const liveExpression =
      opts.registeredById.get(snapshotExpression.id) ?? snapshotExpression;

    if (liveExpression.tombstone === true) {
      continue;
    }

    if (!opts.matchExpression(liveExpression)) {
      continue;
    }

    attempted += 1;
    const attempt = opts.coreRun(liveExpression);

    if (attempt.status === "deploy") {
      deployed += 1;
      continue;
    }

    rejected += 1;

    for (const gate of ["signal", "flags"] satisfies readonly RunGate[]) {
      const delta = attempt.debtDelta?.[gate] ?? 0;
      if (delta <= 0) {
        continue;
      }

      const previous = readDebt(liveExpression, gate);
      const next = previous + delta;
      writeDebt(liveExpression, gate, next);

      if (previous <= 0 && next > 0) {
        appendIfAbsent(opts.backfillQ, liveExpression);
        debtEntries += 1;
      }
    }
  }

  return {
    visited: snapshot.length,
    attempted,
    deployed,
    rejected,
    debtEntries,
  };
}
