/**
 * @file packages/runtime/src/util/guards.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

export function isObjectNonNull(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export function hasOwn<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

// Placeholder deepEqual; replace with spec-appropriate semantics if needed.
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isObjectNonNull(a) || !isObjectNonNull(b)) return false;

  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;

  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  if (aKeys.length !== bKeys.length) return false;

  for (const k of aKeys) {
    if (!hasOwn(bRec, k)) return false;
    if (!deepEqual(aRec[k], bRec[k])) return false;
  }
  return true;
}
