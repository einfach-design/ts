import type { ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import type { FlagsView } from "../state/flagsView.js";
import { hasOwn } from "../util/hasOwn.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toMatchFlagsView = (value: FlagsView | undefined) =>
  value ? { map: { ...value.map }, list: [...value.list] } : undefined;

function snapshot<T>(value: T): T {
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
      out[key] = cloneValue(nested);
    }

    return out;
  };

  return cloneValue(value) as T;
}

function readonlyReference<T>(value: T): T {
  if (!isObject(value)) {
    return value;
  }

  const base: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    base[key] = readonlyReference(nested);
  }

  return new Proxy(base, {
    set() {
      throw new Error("read-only reference");
    },
    deleteProperty() {
      throw new Error("read-only reference");
    },
    defineProperty() {
      throw new Error("read-only reference");
    },
    setPrototypeOf() {
      throw new Error("read-only reference");
    },
    preventExtensions() {
      throw new Error("read-only reference");
    },
  }) as T;
}

function measureEntryBytes(entry: ImpulseQEntryCanonical): number {
  return JSON.stringify(entry).length;
}

export {
  hasOwn,
  isObject,
  toMatchFlagsView,
  snapshot,
  readonlyReference,
  measureEntryBytes,
};
