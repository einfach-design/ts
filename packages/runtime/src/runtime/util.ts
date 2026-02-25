import type { ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import type { FlagsView } from "../state/flagsView.js";
import { hasOwn } from "../util/hasOwn.js";
import { cloneNullProtoRecord } from "../util/nullProto.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const READONLY_ERROR = "runtime.readonly";

const ARRAY_MUTATOR_METHODS = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

const throwReadonlyError = (): never => {
  throw new TypeError(READONLY_ERROR);
};

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

    if (input instanceof Date) {
      const out = new Date(input.getTime());
      seen.set(input, out);
      return out;
    }

    if (input instanceof RegExp) {
      const out = new RegExp(input.source, input.flags);
      out.lastIndex = input.lastIndex;
      seen.set(input, out);
      return out;
    }

    if (input instanceof URL) {
      const out = new URL(input.toString());
      seen.set(input, out);
      return out;
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

    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) {
      return input;
    }

    const out: Record<string, unknown> =
      prototype === null ? Object.create(null) : {};
    seen.set(input, out);
    for (const key of Object.keys(input)) {
      Object.defineProperty(out, key, {
        value: cloneValue((input as Record<string, unknown>)[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    return out;
  };

  return cloneValue(value) as T;
}

const clone = <T>(value: T): T => {
  const sc = (globalThis as { structuredClone?: (v: unknown) => unknown })
    .structuredClone;
  return (typeof sc === "function" ? sc(value) : snapshot(value)) as T;
};

function readonlyView<T>(
  value: T,
  opts?: {
    onOpaque?: (
      valueKind: string,
      opaque: object | ((...args: unknown[]) => unknown),
    ) => void;
  },
): T {
  const seen = new WeakMap<object, unknown>();
  const opaqueSnapshotCache = new WeakMap<object, unknown>();

  const toReadonly = (input: unknown): unknown => {
    if (input === null) {
      return input;
    }

    if (typeof input !== "object" && typeof input !== "function") {
      return input;
    }

    if (typeof input === "function") {
      opts?.onOpaque?.("Function", input);
      if (opaqueSnapshotCache.has(input)) {
        return opaqueSnapshotCache.get(input);
      }

      const readonly = readonlyOpaque(snapshot(input));
      opaqueSnapshotCache.set(input, readonly);
      return readonly;
    }

    if (seen.has(input)) {
      return seen.get(input);
    }

    const isPlain = isPlainObject(input);
    if (!Array.isArray(input) && !isPlain) {
      const valueKind = classifyValueKind(input);
      opts?.onOpaque?.(valueKind, input);
      if (opaqueSnapshotCache.has(input)) {
        return opaqueSnapshotCache.get(input);
      }

      const readonly = readonlyOpaque(snapshot(input));
      opaqueSnapshotCache.set(input, readonly);
      return readonly;
    }

    const proxy = new Proxy(input, {
      get(target, prop, receiver) {
        if (Array.isArray(target) && ARRAY_MUTATOR_METHODS.has(String(prop))) {
          return throwReadonlyError;
        }

        const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
        if (
          descriptor !== undefined &&
          "value" in descriptor &&
          descriptor.configurable === false &&
          descriptor.writable === false
        ) {
          return descriptor.value;
        }

        const current = Reflect.get(target, prop, receiver);
        if (typeof current === "function") {
          if (descriptor !== undefined && "value" in descriptor) {
            return toReadonly(current);
          }

          return current.bind(isPlain ? receiver : target);
        }

        return toReadonly(current);
      },
      set: throwReadonlyError,
      deleteProperty: throwReadonlyError,
      defineProperty: throwReadonlyError,
      setPrototypeOf: throwReadonlyError,
      preventExtensions: throwReadonlyError,
    });

    seen.set(input, proxy);
    return proxy;
  };

  return toReadonly(value) as T;
}

const classifyValueKind = (value: unknown): string => {
  if (value === null) {
    return "Null";
  }

  if (typeof value === "function") {
    return "Function";
  }

  if (typeof value !== "object") {
    return "Primitive";
  }

  if (Array.isArray(value)) {
    return "Array";
  }

  if (isPlainObject(value)) {
    return "PlainObject";
  }

  if (value instanceof Date) {
    return "Date";
  }

  if (value instanceof RegExp) {
    return "RegExp";
  }

  if (value instanceof Map) {
    return "Map";
  }

  if (value instanceof Set) {
    return "Set";
  }

  if (value instanceof Error) {
    return "Error";
  }

  return "UnknownObject";
};

const isProxyWrappableObject = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (
      descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.configurable === false &&
      descriptor.writable === false
    ) {
      const descriptorValue = descriptor.value;
      if (
        descriptorValue !== null &&
        (typeof descriptorValue === "object" ||
          typeof descriptorValue === "function")
      ) {
        return false;
      }
    }
  }

  return true;
};

const readonlyOpaqueCache = new WeakMap<object, unknown>();

const readonlyOpaque = <T extends object | ((...args: unknown[]) => unknown)>(
  value: T,
): T => {
  const toReadonlyOpaque = (input: unknown): unknown => {
    if (input === null) {
      return input;
    }

    if (typeof input !== "object" && typeof input !== "function") {
      return input;
    }

    if (readonlyOpaqueCache.has(input)) {
      return readonlyOpaqueCache.get(input);
    }

    const proxy = new Proxy(input, {
      get(target, prop) {
        const current = Reflect.get(target, prop, target);
        if (typeof current === "function") {
          return () => throwReadonlyError();
        }

        return toReadonlyOpaque(current);
      },
      set: throwReadonlyError,
      deleteProperty: throwReadonlyError,
      defineProperty: throwReadonlyError,
      setPrototypeOf: throwReadonlyError,
      preventExtensions: throwReadonlyError,
      apply: throwReadonlyError,
      construct: throwReadonlyError,
    });

    readonlyOpaqueCache.set(input, proxy);
    return proxy;
  };

  return toReadonlyOpaque(value) as T;
};

const entryBytesCache = new WeakMap<object, number>();

function measureEntryBytes(entry: ImpulseQEntryCanonical): number {
  if (typeof entry === "object" && entry !== null) {
    const cached = entryBytesCache.get(entry as object);
    if (cached !== undefined) {
      return cached;
    }
  }

  const budget: {
    signals: string[];
    addFlags: string[];
    removeFlags: string[];
    useFixedFlags: false | { list: string[]; map: Record<string, true> };
    livePayload?: string;
  } = {
    signals: [...entry.signals],
    addFlags: [...entry.addFlags],
    removeFlags: [...entry.removeFlags],
    useFixedFlags:
      entry.useFixedFlags === false
        ? false
        : {
            list: [...entry.useFixedFlags.list],
            map: cloneNullProtoRecord(entry.useFixedFlags.map),
          },
  };

  if (hasOwn(entry, "livePayload")) {
    budget.livePayload =
      typeof entry.livePayload === "string" ? entry.livePayload : "[opaque]";
  }

  const bytes = JSON.stringify(budget).length;
  entryBytesCache.set(entry as object, bytes);
  return bytes;
}

export {
  hasOwn,
  isObject,
  toMatchFlagsView,
  snapshot,
  clone,
  isPlainObject,
  classifyValueKind,
  isProxyWrappableObject,
  readonlyView,
  readonlyOpaque,
  measureEntryBytes,
};
