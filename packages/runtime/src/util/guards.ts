/**
 * @file packages/runtime/src/util/guards.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Small runtime type guards and utilities.
 */

import { hasOwn } from "./hasOwn.js";

export function isObjectNonNull(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCallable(
  value: unknown,
): value is (...args: unknown[]) => unknown {
  return typeof value === "function";
}

// Re-export for backwards-compatible import paths (many modules import from util/guards.js).
export { hasOwn };

// Placeholder deepEqual; replace with spec-appropriate semantics if needed.
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!isObjectNonNull(a) || !isObjectNonNull(b)) return false;

  const aRec: Record<string, unknown> = a;
  const bRec: Record<string, unknown> = b;

  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  if (aKeys.length !== bKeys.length) return false;

  for (const k of aKeys) {
    if (!hasOwn(bRec, k)) return false;
    if (!deepEqual(aRec[k], bRec[k])) return false;
  }
  return true;
}
