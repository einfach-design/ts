/**
 * @file packages/runtime/src/match/matchExpression.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */
import { hasOwn } from "../util/hasOwn.js";

type FlagSpecValue = true | false | "*";

export type FlagsView = {
  map: Record<string, true>;
  list?: string[];
};

export type FlagSpec = {
  flag: string;
  value: FlagSpecValue;
};

export type MatchExpressionInput = {
  expression: {
    signal?: unknown;
    flags?: FlagSpec[];
    required?: {
      flags?: {
        min?: number;
        max?: number;
        changed?: number;
      };
    };
  };
  defaults: {
    gate: {
      signal: { value: boolean };
      flags: { value: boolean };
    };
  };
  gate?: {
    signal?: boolean;
    flags?: boolean;
  };
  reference?: {
    signal?: unknown;
    flags?: FlagsView;
    changedFlags?: FlagsView | undefined;
  };
  fallbackReference?: {
    signal?: unknown;
    flags?: FlagsView;
    changedFlags?: FlagsView | undefined;
  };
  changedFlags?: FlagsView | undefined;
};

const clampThreshold = (value: number, specCount: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > specCount) {
    return specCount;
  }
  return value;
};

const resolveThreshold = (
  value: number | undefined,
  fallback: number,
  specCount: number,
): number => {
  if (value === undefined || Number.isNaN(value)) {
    return clampThreshold(fallback, specCount);
  }
  return clampThreshold(value, specCount);
};

/**
 * Expression matching (defaults overlay + gate evaluation + required.flags).
 */
export function matchExpression(input: MatchExpressionInput): boolean {
  const resolvedSignalGate =
    input.gate !== undefined && hasOwn(input.gate, "signal")
      ? input.gate.signal
      : input.defaults.gate.signal.value;
  const resolvedFlagsGate =
    input.gate !== undefined && hasOwn(input.gate, "flags")
      ? input.gate.flags
      : input.defaults.gate.flags.value;

  const fallbackReference = input.fallbackReference;
  const reference = input.reference;
  const hasReference = reference !== undefined;

  const resolvedSignal =
    hasReference && hasOwn(reference, "signal")
      ? reference.signal
      : fallbackReference?.signal;

  const resolvedFlags =
    hasReference && hasOwn(reference, "flags")
      ? reference.flags
      : fallbackReference?.flags;

  const resolvedChangedFlags = hasOwn(input, "changedFlags")
    ? input.changedFlags
    : hasReference && hasOwn(reference, "changedFlags")
      ? reference.changedFlags
      : fallbackReference?.changedFlags;

  const signalGateSatisfied =
    resolvedSignalGate === false ||
    input.expression.signal === undefined ||
    input.expression.signal === resolvedSignal;

  if (resolvedFlagsGate === false) {
    return signalGateSatisfied;
  }

  const specs = input.expression.flags ?? [];
  const specCount = specs.length;
  const flagsMap = resolvedFlags?.map ?? {};
  const changedFlagsMap = resolvedChangedFlags?.map ?? {};

  const referenceCount = Object.keys(flagsMap).length;

  let matchCount = 0;
  let changedCount = 0;

  if (specCount === 0) {
    matchCount = referenceCount;
    changedCount = Object.keys(changedFlagsMap).length;
  }

  for (const spec of specs) {
    const isFlagSet = flagsMap[spec.flag] === true;
    const isChanged = hasOwn(changedFlagsMap, spec.flag);

    if (isChanged) {
      changedCount += 1;
    }

    if (
      spec.value === "*" ||
      (spec.value === true && isFlagSet) ||
      (spec.value === false && !isFlagSet)
    ) {
      matchCount += 1;
    }
  }

  const requiredFlags = input.expression.required?.flags;
  const thresholdCount = specCount === 0 ? referenceCount : specCount;
  const minRaw = requiredFlags?.min;
  const min =
    minRaw === undefined
      ? thresholdCount
      : Number.isFinite(minRaw)
        ? specCount === 0
          ? Math.max(0, minRaw)
          : clampThreshold(minRaw, thresholdCount)
        : thresholdCount;

  const max =
    requiredFlags?.max === undefined
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(requiredFlags.max)
        ? clampThreshold(requiredFlags.max, thresholdCount)
        : Number.POSITIVE_INFINITY;

  const changedFallback = specCount === 0 ? 0 : 1;
  const changed = resolveThreshold(requiredFlags?.changed, changedFallback, thresholdCount);

  const changedGateSatisfied = changed === 0 || changedCount >= changed;
  const minMaxGateSatisfied =
    matchCount >= min &&
    (max === Number.POSITIVE_INFINITY || matchCount <= max);

  return signalGateSatisfied && changedGateSatisfied && minMaxGateSatisfied;
}