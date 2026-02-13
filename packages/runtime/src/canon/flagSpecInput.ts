/**
 * @file packages/runtime/src/canon/flagSpecInput.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Canonicalization for public flag-spec registration inputs.
 */

export type FlagSpecValue = true | false | "*";

export type FlagSpec = Readonly<{
  flag: string;
  value: FlagSpecValue;
}>;

export type FlagSpecInput =
  | string
  | readonly string[]
  | Readonly<
      Record<string, FlagSpecValue | { flag?: string; value?: FlagSpecValue }>
    >;

const hasOwn = <T extends object>(obj: T, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(obj, key);

const isFlagSpecValue = (value: unknown): value is FlagSpecValue =>
  value === true || value === false || value === "*";

const assertFlagToken = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new Error("add.flags.invalidToken");
  }
  return value;
};

const assertFlagValue = (value: unknown): FlagSpecValue => {
  if (!isFlagSpecValue(value)) {
    throw new Error("add.flags.invalidValue");
  }
  return value;
};

const collapseLastOneWins = (flatSpecs: readonly FlagSpec[]): FlagSpec[] => {
  const byFlag = new Map<string, FlagSpec>();

  for (const spec of flatSpecs) {
    byFlag.delete(spec.flag);
    byFlag.set(spec.flag, spec);
  }

  return Array.from(byFlag.values());
};

/**
 * Canonicalize `FlagSpecInput` into deterministic `FlagSpec[]`.
 *
 * @throws Error with `add.flags.invalidToken` when a flag token is invalid.
 * @throws Error with `add.flags.invalidValue` when a spec value is invalid.
 */
export function canonFlagSpecInput(input: FlagSpecInput): FlagSpec[] {
  const flatSpecs: FlagSpec[] = [];

  if (typeof input === "string") {
    flatSpecs.push({ flag: assertFlagToken(input), value: true });
    return flatSpecs;
  }

  if (Array.isArray(input)) {
    for (const token of input) {
      flatSpecs.push({ flag: assertFlagToken(token), value: true });
    }

    return collapseLastOneWins(flatSpecs);
  }

  if (typeof input !== "object" || input === null) {
    throw new Error("add.flags.invalidToken");
  }

  const mapInput = input as Readonly<
    Record<string, FlagSpecValue | { flag?: string; value?: FlagSpecValue }>
  >;

  for (const key of Object.keys(mapInput)) {
    const mapValue = mapInput[key];

    if (isFlagSpecValue(mapValue)) {
      flatSpecs.push({
        flag: assertFlagToken(key),
        value: mapValue,
      });
      continue;
    }

    if (typeof mapValue !== "object" || mapValue === null) {
      throw new Error("add.flags.invalidValue");
    }

    const resolvedFlag = hasOwn(mapValue, "flag")
      ? assertFlagToken(mapValue.flag)
      : assertFlagToken(key);

    const resolvedValue = hasOwn(mapValue, "value")
      ? assertFlagValue(mapValue.value)
      : true;

    flatSpecs.push({ flag: resolvedFlag, value: resolvedValue });
  }

  return collapseLastOneWins(flatSpecs);
}
