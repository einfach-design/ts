/**
 * @file packages/runtime/src/state/backfillQ.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Backfill queue helpers.
 */

export type BackfillExpression = {
  id: string;
};

export type BackfillQ<TExpression extends BackfillExpression> = {
  list: TExpression[];
  map: Record<string, true>;
};

export type BackfillQSnapshot = {
  list: string[];
  map: Record<string, true>;
};

/**
 * Creates an empty backfill queue.
 */
export function createBackfillQ<
  TExpression extends BackfillExpression,
>(): BackfillQ<TExpression> {
  return { list: [], map: {} };
}

/**
 * Enqueues expression by id in FIFO order if it is not already present.
 * Deduplication is strictly id-based and never reference-based.
 */
export function appendIfAbsent<TExpression extends BackfillExpression>(
  backfillQ: BackfillQ<TExpression>,
  expression: TExpression,
): boolean {
  const id = expression.id;
  if (backfillQ.map[id] === true) {
    return false;
  }

  backfillQ.list.push(expression);
  backfillQ.map[id] = true;
  return true;
}

/**
 * Projects the internal queue view into its id-only snapshot representation.
 */
export function toBackfillQSnapshot<TExpression extends BackfillExpression>(
  backfillQ: BackfillQ<TExpression>,
): BackfillQSnapshot {
  const list = backfillQ.list.map((expression) => expression.id);
  const map = Object.fromEntries(list.map((id) => [id, true])) as Record<
    string,
    true
  >;

  return { list, map };
}

/**
 * Resets the queue to a hard-new empty instance.
 */
export function resetBackfillQ<
  TExpression extends BackfillExpression,
>(): BackfillQ<TExpression> {
  return { list: [], map: {} };
}

/**
 * Guardrail assert for list/map bijection.
 */
export function assertBackfillQInvariant<
  TExpression extends BackfillExpression,
>(backfillQ: BackfillQ<TExpression>): void {
  const uniqueListIds = new Set(
    backfillQ.list.map((expression) => expression.id),
  );

  if (uniqueListIds.size !== backfillQ.list.length) {
    throw new Error("Invalid backfillQ invariant: duplicate ids in list.");
  }

  const mapIds = Object.keys(backfillQ.map);
  if (mapIds.length !== uniqueListIds.size) {
    throw new Error(
      "Invalid backfillQ invariant: list/map cardinality mismatch.",
    );
  }

  for (const id of uniqueListIds) {
    if (backfillQ.map[id] !== true) {
      throw new Error(
        `Invalid backfillQ invariant: missing map marker for id '${id}'.`,
      );
    }
  }
}
