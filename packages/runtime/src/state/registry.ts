/**
 * @file packages/runtime/src/state/registry.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Registry state helpers (registeredQ + registeredById + tombstones).
 */

export type RegistryExpression = {
  id: string;
  tombstone?: true;
};

export type RegistryState<TExpression extends RegistryExpression> = {
  registeredQ: TExpression[];
  registeredById: Map<string, TExpression>;
};

export type RegistryStore<TExpression extends RegistryExpression> =
  RegistryState<TExpression> & {
    register(expression: TExpression): TExpression;
    resolve(id: string): TExpression | undefined;
    remove(id: string): TExpression | undefined;
    compact(): void;
    isRegistered(id: string): boolean;
    activeList(): TExpression[];
  };

/**
 * Creates registry state and id-based helpers.
 *
 * Invariants:
 * - `registeredQ` keeps deterministic insert-order history.
 * - `registeredById` is the id-based SSoT lookup.
 * - remove marks `tombstone` and keeps historical entry in `registeredQ`.
 */
export function registry<
  TExpression extends RegistryExpression,
>(): RegistryStore<TExpression> {
  const COMPACT_TOMBSTONE_ABSOLUTE_MIN = 8;
  const COMPACT_TOMBSTONE_RELATIVE_MIN = 0.25;

  const registeredQ: TExpression[] = [];
  const registeredById = new Map<string, TExpression>();
  let tombstoneCount = 0;

  const register = (expression: TExpression): TExpression => {
    if (registeredById.has(expression.id)) {
      throw new Error(`Duplicate registered expression id: ${expression.id}`);
    }

    registeredQ.push(expression);
    registeredById.set(expression.id, expression);
    return expression;
  };

  const resolve = (id: string): TExpression | undefined => {
    return registeredById.get(id);
  };

  const remove = (id: string): TExpression | undefined => {
    const expression = registeredById.get(id);
    if (expression === undefined) {
      return undefined;
    }

    expression.tombstone = true;
    tombstoneCount += 1;
    registeredById.delete(id);

    const reachesAbsoluteMin = tombstoneCount >= COMPACT_TOMBSTONE_ABSOLUTE_MIN;
    const tombstoneShare =
      registeredQ.length === 0 ? 0 : tombstoneCount / registeredQ.length;
    const reachesRelativeMin = tombstoneShare >= COMPACT_TOMBSTONE_RELATIVE_MIN;
    if (reachesAbsoluteMin && reachesRelativeMin) {
      compact();
    }

    return expression;
  };

  const compact = (): void => {
    let didCompact = false;

    for (let index = registeredQ.length - 1; index >= 0; index -= 1) {
      if (registeredQ[index]?.tombstone === true) {
        registeredQ.splice(index, 1);
        didCompact = true;
      }
    }

    if (didCompact) {
      tombstoneCount = 0;
    }
  };

  const isRegistered = (id: string): boolean => {
    const expression = registeredById.get(id);
    return expression !== undefined && expression.tombstone !== true;
  };

  const activeList = (): TExpression[] => {
    return registeredQ.filter((expression) => expression.tombstone !== true);
  };

  return {
    registeredQ,
    registeredById,
    register,
    resolve,
    remove,
    compact,
    isRegistered,
    activeList,
  };
}
