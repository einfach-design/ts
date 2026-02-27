/**
 * @file packages/runtime/src/util/guards.ts
 * @version 0.12.0
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
