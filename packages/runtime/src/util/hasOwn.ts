/**
 * @file packages/runtime/src/util/hasOwn.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Canonical own-property check helper.
 */

/**
 * Checks whether `key` is an own (non-inherited) property of `obj`.
 *
 * Overloads:
 * - boolean usage: `hasOwn(obj, key)`
 * - type-guard usage: `if (hasOwn(obj, key)) { obj[key] ... }`
 */
export function hasOwn(obj: object, key: PropertyKey): boolean;
export function hasOwn<K extends PropertyKey>(
  obj: object,
  key: K,
): obj is Record<K, unknown>;
export function hasOwn(obj: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}
