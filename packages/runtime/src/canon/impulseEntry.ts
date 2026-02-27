/**
 * @file packages/runtime/src/canon/impulseEntry.ts
 * @version 0.12.0
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

const readStringList = (
  value: unknown,
  options?: {
    dedupeOnTrim?: boolean;
    normalizeOutput?: boolean;
    rejectTrimCollisions?: boolean;
  },
): readonly string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const dedupeOnTrim = options?.dedupeOnTrim === true;
  const normalizeOutput = options?.normalizeOutput === true;
  const rejectTrimCollisions = options?.rejectTrimCollisions === true;
  const seen = new Set<string>();
  const seenCanonical = new Set<string>();
  const seenTrimVariant = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return undefined;
    }

    const token = item.trim();
    if (token.length === 0) {
      return undefined;
    }

    if (dedupeOnTrim) {
      if (seen.has(token)) {
        return undefined;
      }
      seen.add(token);
    }

    if (rejectTrimCollisions) {
      if (item === token) {
        if (seenTrimVariant.has(token)) {
          return undefined;
        }
        seenCanonical.add(token);
      } else {
        if (seenCanonical.has(token) || seenTrimVariant.has(token)) {
          return undefined;
        }
        seenTrimVariant.add(token);
      }
    }

    out.push(normalizeOutput ? token : item);
  }

  return out;
};

const isFlagsView = (value: unknown): value is FlagsView => {
  if (!isObjectNonNull(value)) {
    return false;
  }

  const list = value.list;
  const map = value.map;

  if (!Array.isArray(list) || !isObjectNonNull(map)) {
    return false;
  }

  const normalizedList = readStringList(list, {
    dedupeOnTrim: true,
    normalizeOutput: true,
  });
  if (normalizedList === undefined) {
    return false;
  }

  const seen = new Set(normalizedList);

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

const cloneObjectNoGet = (obj: object): object => {
  const proto = Object.getPrototypeOf(obj);
  const out = Object.create(proto === null ? null : Object.prototype);

  for (const key of Reflect.ownKeys(obj)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key);
    if (descriptor === undefined) {
      continue;
    }
    Object.defineProperty(out, key, descriptor);
  }

  return Object.freeze(out);
};

const cloneArrayNoIter = (arr: readonly unknown[]): readonly unknown[] => {
  const out = new Array(arr.length);

  for (const key of Reflect.ownKeys(arr)) {
    const descriptor = Object.getOwnPropertyDescriptor(arr, key);
    if (descriptor === undefined) {
      continue;
    }
    Object.defineProperty(out, key, descriptor);
  }

  return Object.freeze(out);
};

const snapshotLivePayload = (payload: unknown): unknown => {
  if (Array.isArray(payload)) {
    return cloneArrayNoIter(payload);
  }

  if (isObjectNonNull(payload)) {
    const proto = Object.getPrototypeOf(payload);
    if (proto === Object.prototype || proto === null) {
      return cloneObjectNoGet(payload);
    }
  }

  return payload;
};

/**
 * Canonicalize a `run.impulse(opts)` payload into a queue entry + outer onError mode.
 * Returns `entry: undefined` for invalid entry payloads.
 */
export function canonImpulseEntry(
  input: unknown,
): ImpulseEntryCanonicalization {
  if (!isObjectNonNull(input)) {
    return { entry: undefined, onError: undefined };
  }

  const source = input as Record<string, unknown>;
  const hasInputOnError = hasOwn(source, "onError");
  const onErrorCandidate = hasInputOnError ? source.onError : undefined;
  const onError = isRuntimeOnError(onErrorCandidate)
    ? onErrorCandidate
    : undefined;

  const signals = readStringList(
    hasOwn(source, "signals") ? source.signals : [],
    { rejectTrimCollisions: true },
  );
  if (signals === undefined) {
    return { entry: undefined, onError };
  }

  const addFlags = readStringList(
    hasOwn(source, "addFlags") ? source.addFlags : [],
    { rejectTrimCollisions: true },
  );
  if (addFlags === undefined) {
    return { entry: undefined, onError };
  }

  const removeFlags = readStringList(
    hasOwn(source, "removeFlags") ? source.removeFlags : [],
    { rejectTrimCollisions: true },
  );
  if (removeFlags === undefined) {
    return { entry: undefined, onError };
  }

  let useFixedFlags: false | FlagsView = false;
  if (hasOwn(source, "useFixedFlags")) {
    if (source.useFixedFlags === false) {
      useFixedFlags = false;
    } else if (isFlagsView(source.useFixedFlags)) {
      useFixedFlags = source.useFixedFlags;
    } else {
      return { entry: undefined, onError };
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
        ? { livePayload: snapshotLivePayload(source.livePayload) }
        : {}),
    },
  };
}
