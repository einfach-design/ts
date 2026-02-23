import type { ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import type { FlagsView } from "../state/flagsView.js";
import { hasOwn } from "../util/hasOwn.js";
import { cloneNullProtoRecord } from "../util/nullProto.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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

function readonlyView<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();
  const originalByProxy = new WeakMap<object, object>();

  const unwrap = <U>(rawValue: U): U => {
    if (typeof rawValue !== "object" || rawValue === null) {
      return rawValue;
    }

    return (originalByProxy.get(rawValue as unknown as object) ??
      rawValue) as U;
  };

  const toReadonly = (input: unknown): unknown => {
    if (typeof input !== "object" || input === null) {
      return input;
    }

    if (seen.has(input)) {
      return seen.get(input);
    }

    if (input instanceof Map) {
      const mapProxy = new Proxy(input, {
        get(target, prop) {
          if (prop === "set" || prop === "clear") {
            return throwReadonlyError;
          }

          if (prop === "delete") {
            return (key: unknown) => {
              const rawKey = unwrap(key);
              void rawKey;
              return throwReadonlyError();
            };
          }

          if (prop === "get") {
            return (key: unknown) => {
              const rawKey = unwrap(key);
              return toReadonly(target.get(rawKey));
            };
          }

          if (prop === "has") {
            return (key: unknown) => {
              const rawKey = unwrap(key);
              return target.has(rawKey);
            };
          }

          if (prop === "values") {
            return function* values() {
              for (const entry of target.values()) {
                yield toReadonly(entry);
              }
            };
          }

          if (prop === "keys") {
            return function* keys() {
              for (const entry of target.keys()) {
                yield toReadonly(entry);
              }
            };
          }

          if (prop === "entries" || prop === Symbol.iterator) {
            return function* entries() {
              for (const [key, mapValue] of target.entries()) {
                yield [toReadonly(key), toReadonly(mapValue)] as const;
              }
            };
          }

          if (prop === "forEach") {
            return (
              callback: (
                value: unknown,
                key: unknown,
                map: ReadonlyMap<unknown, unknown>,
              ) => void,
              thisArg?: unknown,
            ) => {
              target.forEach((entryValue, entryKey) => {
                callback.call(
                  thisArg,
                  toReadonly(entryValue),
                  toReadonly(entryKey),
                  mapProxy,
                );
              });
            };
          }

          if (prop === "size") {
            return target.size;
          }

          if (typeof prop === "symbol") {
            if (prop === Symbol.toStringTag) {
              return Reflect.get(target, prop, target);
            }
          }

          const current = Reflect.get(target, prop, mapProxy);
          if (typeof current === "function") {
            return current.bind(mapProxy);
          }

          return toReadonly(current);
        },
        set: throwReadonlyError,
        deleteProperty: throwReadonlyError,
        defineProperty: throwReadonlyError,
        setPrototypeOf: throwReadonlyError,
        preventExtensions: throwReadonlyError,
      });

      seen.set(input, mapProxy);
      originalByProxy.set(mapProxy, input);
      return mapProxy;
    }

    if (input instanceof Set) {
      const setProxy = new Proxy(input, {
        get(target, prop) {
          if (prop === "add" || prop === "clear") {
            return throwReadonlyError;
          }

          if (prop === "delete") {
            return (valueToDelete: unknown) => {
              const rawValue = unwrap(valueToDelete);
              void rawValue;
              return throwReadonlyError();
            };
          }

          if (prop === "has") {
            return (valueToCheck: unknown) => {
              const rawValue = unwrap(valueToCheck);
              return target.has(rawValue);
            };
          }

          if (
            prop === "values" ||
            prop === "keys" ||
            prop === Symbol.iterator
          ) {
            return function* values() {
              for (const entry of target.values()) {
                yield toReadonly(entry);
              }
            };
          }

          if (prop === "entries") {
            return function* entries() {
              for (const entry of target.values()) {
                const readonlyEntry = toReadonly(entry);
                yield [readonlyEntry, readonlyEntry] as const;
              }
            };
          }

          if (prop === "forEach") {
            return (
              callback: (
                value: unknown,
                key: unknown,
                set: ReadonlySet<unknown>,
              ) => void,
              thisArg?: unknown,
            ) => {
              target.forEach((entryValue) => {
                const readonlyEntry = toReadonly(entryValue);
                callback.call(thisArg, readonlyEntry, readonlyEntry, setProxy);
              });
            };
          }

          if (prop === "size") {
            return target.size;
          }

          if (typeof prop === "symbol") {
            if (prop === Symbol.toStringTag) {
              return Reflect.get(target, prop, target);
            }
          }

          const current = Reflect.get(target, prop, setProxy);
          if (typeof current === "function") {
            return current.bind(setProxy);
          }

          return toReadonly(current);
        },
        set: throwReadonlyError,
        deleteProperty: throwReadonlyError,
        defineProperty: throwReadonlyError,
        setPrototypeOf: throwReadonlyError,
        preventExtensions: throwReadonlyError,
      });

      seen.set(input, setProxy);
      originalByProxy.set(setProxy, input);
      return setProxy;
    }

    const prototype = Object.getPrototypeOf(input);
    if (
      prototype !== Object.prototype &&
      prototype !== null &&
      !Array.isArray(input)
    ) {
      return input;
    }

    const proxy = new Proxy(input, {
      get(target, prop, receiver) {
        if (Array.isArray(target) && ARRAY_MUTATOR_METHODS.has(String(prop))) {
          return throwReadonlyError;
        }

        const current = Reflect.get(target, prop, receiver);
        if (typeof current === "function") {
          return current.bind(receiver);
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
    originalByProxy.set(proxy, input);
    return proxy;
  };

  return toReadonly(value) as T;
}

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
  readonlyView,
  measureEntryBytes,
};
