/**
 * @file packages/runtime/src/canon/impulseEntry.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Canonicalization for impulse queue entries.
 */

import { hasOwn, isObjectNonNull } from "../util/guards.js";

export type FlagsView = Readonly<{
  list: readonly string[];
  map: Readonly<Record<string, true>>;
}>;

export type ImpulseEntryInput = {
  signals?: readonly string[];
  addFlags?: readonly string[];
  removeFlags?: readonly string[];
  useFixedFlags?: false | FlagsView;
  livePayload?: unknown;
};

export type ImpulseQEntryCanonical = Readonly<{
  signals: readonly string[];
  addFlags: readonly string[];
  removeFlags: readonly string[];
  useFixedFlags: false | FlagsView;
  livePayload?: unknown;
}>;

const isFlagsView = (value: unknown): value is FlagsView => {
  if (!isObjectNonNull(value)) {
    return false;
  }

  const list = value.list;
  const map = value.map;

  if (!Array.isArray(list) || !isObjectNonNull(map)) {
    return false;
  }

  const seen = new Set<string>();
  for (const item of list) {
    if (typeof item !== "string" || seen.has(item)) {
      return false;
    }
    seen.add(item);
  }

  const mapKeys = Object.keys(map);
  if (mapKeys.length !== seen.size) {
    return false;
  }

  for (const key of mapKeys) {
    if (map[key] !== true || !seen.has(key)) {
      return false;
    }
  }

  return true;
};

/**
 * Canonicalize a `run.impulse(opts)` payload into a queue entry.
 * Returns `undefined` for invalid entry payloads.
 */
export function canonImpulseEntry(
  input: unknown,
): ImpulseQEntryCanonical | undefined {
  const source = isObjectNonNull(input) ? input : {};

  const signals = hasOwn(source, "signals") ? source.signals : [];
  if (!Array.isArray(signals)) {
    return undefined;
  }

  const addFlags = hasOwn(source, "addFlags") ? source.addFlags : [];
  if (!Array.isArray(addFlags)) {
    return undefined;
  }

  const removeFlags = hasOwn(source, "removeFlags") ? source.removeFlags : [];
  if (!Array.isArray(removeFlags)) {
    return undefined;
  }

  let useFixedFlags: false | FlagsView = false;
  if (hasOwn(source, "useFixedFlags")) {
    if (source.useFixedFlags === false) {
      useFixedFlags = false;
    } else if (isFlagsView(source.useFixedFlags)) {
      useFixedFlags = source.useFixedFlags;
    } else {
      return undefined;
    }
  }

  return {
    signals,
    addFlags,
    removeFlags,
    useFixedFlags,
    ...(hasOwn(source, "livePayload")
      ? { livePayload: source.livePayload }
      : {}),
  };
}
