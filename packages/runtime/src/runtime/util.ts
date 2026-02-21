import type { ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import type { FlagsView } from "../state/flagsView.js";
import { hasOwn } from "../util/hasOwn.js";
import { cloneNullProtoRecord } from "../util/nullProto.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toMatchFlagsView = (value: FlagsView | undefined) =>
  value
    ? { map: cloneNullProtoRecord(value.map), list: [...value.list] }
    : undefined;

function snapshot<T>(value: T): T {
  /**
   * Produces the runtime snapshot clone used by `get(..., { as: "snapshot" })`.
   *
   * Clone semantics (spec-aligned):
   * - Deep-clones Arrays.
   * - Deep-clones Plain Objects (`Object.getPrototypeOf(value) === Object.prototype`).
   * - Deep-clones Maps (keys and values).
   * - Deep-clones Sets (elements).
   * - Does not clone Non-Plain Objects (prototype differs from `Object.prototype`),
   *   including functions; these values are passed through by reference.
   *
   * Note on opaque payloads (`livePayload`): payload data is engine-opaque by policy.
   * Snapshots can therefore intentionally contain references when payload values are
   * Non-Plain Objects.
   */
  const seen = new WeakMap<object, unknown>();

  const cloneValue = (input: unknown): unknown => {
    if (typeof input !== "object" || input === null) {
      return input;
    }

    if (seen.has(input)) {
      return seen.get(input);
    }

    if (Array.isArray(input)) {
      const out: unknown[] = [];
      seen.set(input, out);
      for (const item of input) {
        out.push(cloneValue(item));
      }
      return out;
    }

    if (input instanceof Map) {
      const out = new Map<unknown, unknown>();
      seen.set(input, out);
      for (const [key, mapValue] of input.entries()) {
        out.set(cloneValue(key), cloneValue(mapValue));
      }
      return out;
    }

    if (input instanceof Set) {
      const out = new Set<unknown>();
      seen.set(input, out);
      for (const item of input.values()) {
        out.add(cloneValue(item));
      }
      return out;
    }

    if (Object.getPrototypeOf(input) !== Object.prototype) {
      return input;
    }

    const out: Record<string, unknown> = {};
    seen.set(input, out);
    for (const [key, nested] of Object.entries(input)) {
      Object.defineProperty(out, key, {
        value: cloneValue(nested),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return out;
  };

  return cloneValue(value) as T;
}

function measureEntryBytes(entry: ImpulseQEntryCanonical): number {
  let bytes = 0;

  for (const signal of entry.signals) {
    bytes += signal.length;
  }

  for (const addFlag of entry.addFlags) {
    bytes += addFlag.length;
  }

  for (const removeFlag of entry.removeFlags) {
    bytes += removeFlag.length;
  }

  if (entry.useFixedFlags !== false) {
    bytes += entry.useFixedFlags.list.length;
  }

  if (hasOwn(entry, "livePayload")) {
    bytes +=
      typeof entry.livePayload === "string" ? entry.livePayload.length : 64;
  }

  return bytes;
}

export { hasOwn, isObject, toMatchFlagsView, snapshot, measureEntryBytes };
