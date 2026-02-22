/**
 * @file packages/runtime/src/canon/impulseEntry.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Canonicalization for impulse queue entries.
 */

import type { RuntimeOnError } from "../runtime/store.js";
import { hasOwn, isObjectNonNull } from "../util/guards.js";

export type FlagsView = Readonly<{
  list: readonly string[];
  map: Readonly<Record<string, true>>;
}>;

export type ImpulseEntryInput = {
  onError?: RuntimeOnError;
  signals?: readonly string[];
  addFlags?: readonly string[];
  removeFlags?: readonly string[];
  useFixedFlags?: false | FlagsView;
  livePayload?: unknown;
};

export type ImpulseQEntryCanonical = Readonly<{
  onError?: RuntimeOnError;
  signals: readonly string[];
  addFlags: readonly string[];
  removeFlags: readonly string[];
  useFixedFlags: false | FlagsView;
  livePayload?: unknown;
}>;

export type ImpulseEntryCanonicalization = Readonly<{
  entry: ImpulseQEntryCanonical | undefined;
  onError: RuntimeOnError | undefined;
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

const isRuntimeOnError = (value: unknown): value is RuntimeOnError =>
  value === undefined ||
  value === "throw" ||
  value === "report" ||
  value === "swallow" ||
  typeof value === "function";

const sourceWithOnError = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const { onError: _onError, ...rest } = value;
  return rest;
};

/**
 * Canonicalize a `run.impulse(opts)` payload into a queue entry + outer onError mode.
 * Returns `entry: undefined` for invalid entry payloads.
 */
export function canonImpulseEntry(
  input: unknown,
): ImpulseEntryCanonicalization {
  const source = isObjectNonNull(input) ? sourceWithOnError(input) : {};
  const hasInputOnError = isObjectNonNull(input) && hasOwn(input, "onError");
  const onErrorCandidate = hasInputOnError ? input.onError : undefined;
  const onError = isRuntimeOnError(onErrorCandidate)
    ? onErrorCandidate
    : undefined;

  const signals = hasOwn(source, "signals") ? source.signals : [];
  if (
    !Array.isArray(signals) ||
    !signals.every((signal) => typeof signal === "string")
  ) {
    return { entry: undefined, onError };
  }

  const addFlags = hasOwn(source, "addFlags") ? source.addFlags : [];
  if (
    !Array.isArray(addFlags) ||
    !addFlags.every((flag) => typeof flag === "string")
  ) {
    return { entry: undefined, onError };
  }

  const removeFlags = hasOwn(source, "removeFlags") ? source.removeFlags : [];
  if (
    !Array.isArray(removeFlags) ||
    !removeFlags.every((flag) => typeof flag === "string")
  ) {
    return { entry: undefined, onError };
  }

  let useFixedFlags: false | FlagsView = false;
  if (hasOwn(source, "useFixedFlags")) {
    if (source.useFixedFlags === false) {
      useFixedFlags = false;
    } else if (isFlagsView(source.useFixedFlags)) {
      useFixedFlags = source.useFixedFlags;
    } else {
      return {
        entry: undefined,
        onError: hasInputOnError ? onError : undefined,
      };
    }
  }

  if (hasInputOnError && onError === undefined) {
    return { entry: undefined, onError: undefined };
  }

  return {
    onError,
    entry: {
      ...(onError !== undefined ? { onError } : {}),
      signals,
      addFlags,
      removeFlags,
      useFixedFlags,
      ...(hasOwn(source, "livePayload")
        ? { livePayload: source.livePayload }
        : {}),
    },
  };
}
