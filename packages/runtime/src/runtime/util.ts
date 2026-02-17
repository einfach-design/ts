import type { ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import type { FlagsView } from "../state/flagsView.js";
import { hasOwn } from "../util/hasOwn.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toMatchFlagsView = (value: FlagsView | undefined) =>
  value ? { map: { ...value.map }, list: [...value.list] } : undefined;

function snapshot<T>(value: T): T {
  return structuredClone(value);
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

export { hasOwn, isObject, toMatchFlagsView, snapshot, readonlyReference, measureEntryBytes };