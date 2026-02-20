/**
 * @file packages/runtime/src/state/defaults.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Defaults storage/resolution helpers.
 */
import { hasOwn } from "../util/hasOwn.js";

export type Scope = "applied" | "pending" | "pendingOnly";

export type DefaultsDimScope = Readonly<{
  value: Scope;
  force: true | undefined;
}>;

export type DefaultsDimGate = Readonly<{
  value: boolean;
  force: true | undefined;
}>;

export type Defaults = Readonly<{
  scope: Readonly<{
    signal: DefaultsDimScope;
    flags: DefaultsDimScope;
  }>;
  gate: Readonly<{
    signal: DefaultsDimGate;
    flags: DefaultsDimGate;
  }>;
}>;

export type SetDefaultsDimScope = Readonly<{
  value: Scope;
  force?: true;
}>;

export type SetDefaultsDimGate = Readonly<{
  value: boolean;
  force?: true;
}>;

export type SetDefaults = Readonly<{
  scope?:
    | Scope
    | Readonly<{
        signal?: Scope | SetDefaultsDimScope;
        flags?: Scope | SetDefaultsDimScope;
      }>;
  gate?:
    | boolean
    | Readonly<{
        signal?: boolean | SetDefaultsDimGate;
        flags?: boolean | SetDefaultsDimGate;
      }>;
}>;

export type ResolvedDefaults = Defaults;

export type WithDefaults = Readonly<{
  scope?: SetDefaults["scope"];
  gate?: SetDefaults["gate"];
}>;

export type ResolveDefaultsInput = Readonly<{
  baseline?: Defaults;
  expressionOverrides?: SetDefaults;
  impulseOverrides?: SetDefaults;
  callOverrides?: SetDefaults;
}>;

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null && Array.isArray(value) === false;

const assertValidPresentValue = (
  container: Record<PropertyKey, unknown>,
  key: PropertyKey,
  context: string,
): void => {
  if (hasOwn(container, key) && container[key] === undefined) {
    throw new Error(`${context} must not be undefined.`);
  }
};

const assertForce = (
  source: Record<PropertyKey, unknown>,
  context: string,
): true | undefined => {
  assertValidPresentValue(source, "force", context);

  if (!hasOwn(source, "force")) {
    return undefined;
  }

  if (source.force !== true) {
    throw new Error(`${context}.force must be true when set.`);
  }

  if (!hasOwn(source, "value")) {
    throw new Error(`${context}.value is required when force is true.`);
  }

  return true;
};

const isScope = (value: unknown): value is Scope =>
  value === "applied" || value === "pending" || value === "pendingOnly";

const canonicalScopeDim = (
  source: Scope | SetDefaultsDimScope,
  context: string,
): Readonly<{ value: Scope; force: true | undefined }> => {
  if (typeof source === "string") {
    if (!isScope(source)) {
      throw new Error(`${context}.value must be Scope.`);
    }

    return { value: source, force: undefined };
  }

  if (!isRecord(source)) {
    throw new Error(`${context} must be Scope or object.`);
  }

  assertValidPresentValue(source, "value", context);

  if (!hasOwn(source, "value")) {
    throw new Error(`${context}.value is required.`);
  }

  if (!isScope(source.value)) {
    throw new Error(`${context}.value must be Scope.`);
  }

  return { value: source.value, force: assertForce(source, context) };
};

const canonicalGateDim = (
  source: boolean | SetDefaultsDimGate,
  context: string,
): Readonly<{ value: boolean; force: true | undefined }> => {
  if (typeof source === "boolean") {
    return { value: source, force: undefined };
  }

  if (!isRecord(source)) {
    throw new Error(`${context} must be boolean or object.`);
  }

  assertValidPresentValue(source, "value", context);

  if (!hasOwn(source, "value")) {
    throw new Error(`${context}.value is required.`);
  }

  return {
    value: source.value as boolean,
    force: assertForce(source, context),
  };
};

type CanonicalSetDefaults = {
  scope?: {
    signal?: Readonly<{ value: Scope; force: true | undefined }>;
    flags?: Readonly<{ value: Scope; force: true | undefined }>;
  };
  gate?: {
    signal?: Readonly<{ value: boolean; force: true | undefined }>;
    flags?: Readonly<{ value: boolean; force: true | undefined }>;
  };
};

function canonicalizeSetDefaults(
  input: SetDefaults | undefined,
): CanonicalSetDefaults {
  if (input === undefined) {
    return {};
  }

  if (!isRecord(input)) {
    throw new Error("defaults overrides must be an object.");
  }

  assertValidPresentValue(input, "scope", "defaults.scope");
  assertValidPresentValue(input, "gate", "defaults.gate");

  const output: CanonicalSetDefaults = {};

  if (hasOwn(input, "scope")) {
    if (typeof input.scope === "string") {
      output.scope = {
        signal: canonicalScopeDim(input.scope, "defaults.scope.signal"),
        flags: canonicalScopeDim(input.scope, "defaults.scope.flags"),
      };
    } else {
      if (!isRecord(input.scope)) {
        throw new Error("defaults.scope must be Scope or object.");
      }

      assertValidPresentValue(input.scope, "signal", "defaults.scope.signal");
      assertValidPresentValue(input.scope, "flags", "defaults.scope.flags");

      output.scope = {};

      if (hasOwn(input.scope, "signal")) {
        output.scope.signal = canonicalScopeDim(
          input.scope.signal as Scope | SetDefaultsDimScope,
          "defaults.scope.signal",
        );
      }

      if (hasOwn(input.scope, "flags")) {
        output.scope.flags = canonicalScopeDim(
          input.scope.flags as Scope | SetDefaultsDimScope,
          "defaults.scope.flags",
        );
      }
    }
  }

  if (hasOwn(input, "gate")) {
    if (typeof input.gate === "boolean") {
      output.gate = {
        signal: { value: input.gate, force: undefined },
        flags: { value: input.gate, force: undefined },
      };
    } else {
      if (!isRecord(input.gate)) {
        throw new Error("defaults.gate must be boolean or object.");
      }

      assertValidPresentValue(input.gate, "signal", "defaults.gate.signal");
      assertValidPresentValue(input.gate, "flags", "defaults.gate.flags");

      output.gate = {};

      if (hasOwn(input.gate, "signal")) {
        output.gate.signal = canonicalGateDim(
          input.gate.signal as boolean | SetDefaultsDimGate,
          "defaults.gate.signal",
        );
      }

      if (hasOwn(input.gate, "flags")) {
        output.gate.flags = canonicalGateDim(
          input.gate.flags as boolean | SetDefaultsDimGate,
          "defaults.gate.flags",
        );
      }
    }
  }

  return output;
}

/**
 * Baseline defaults as required by the Runtime specification.
 */
export const globalDefaults: Defaults = {
  scope: {
    signal: { value: "applied", force: undefined },
    flags: { value: "applied", force: undefined },
  },
  gate: {
    signal: { value: true, force: undefined },
    flags: { value: true, force: undefined },
  },
};

type Candidate<TValue> = Readonly<{ value: TValue; force: true | undefined }>;

function resolveDim<TValue>(
  candidates: readonly Candidate<TValue>[],
): Candidate<TValue> {
  const forceActive = candidates.some((candidate) => candidate.force === true);
  const filtered = forceActive
    ? candidates.filter((candidate) => candidate.force === true)
    : candidates;

  return filtered[filtered.length - 1] as Candidate<TValue>;
}

/**
 * Resolve defaults using the mandatory 4-level cascade.
 */
export function resolveDefaults(
  input: ResolveDefaultsInput = {},
): ResolvedDefaults {
  const baseline = input.baseline ?? globalDefaults;
  const expression = canonicalizeSetDefaults(input.expressionOverrides);
  const impulse = canonicalizeSetDefaults(input.impulseOverrides);
  const call = canonicalizeSetDefaults(input.callOverrides);

  return {
    scope: {
      signal: resolveDim([
        baseline.scope.signal,
        expression.scope?.signal
          ? {
              value: expression.scope.signal.value,
              force: expression.scope.signal.force === true ? true : undefined,
            }
          : baseline.scope.signal,
        impulse.scope?.signal
          ? {
              value: impulse.scope.signal.value,
              force: impulse.scope.signal.force === true ? true : undefined,
            }
          : baseline.scope.signal,
        call.scope?.signal
          ? {
              value: call.scope.signal.value,
              force: call.scope.signal.force === true ? true : undefined,
            }
          : baseline.scope.signal,
      ]),
      flags: resolveDim([
        baseline.scope.flags,
        expression.scope?.flags
          ? {
              value: expression.scope.flags.value,
              force: expression.scope.flags.force === true ? true : undefined,
            }
          : baseline.scope.flags,
        impulse.scope?.flags
          ? {
              value: impulse.scope.flags.value,
              force: impulse.scope.flags.force === true ? true : undefined,
            }
          : baseline.scope.flags,
        call.scope?.flags
          ? {
              value: call.scope.flags.value,
              force: call.scope.flags.force === true ? true : undefined,
            }
          : baseline.scope.flags,
      ]),
    },
    gate: {
      signal: resolveDim([
        baseline.gate.signal,
        expression.gate?.signal
          ? {
              value: expression.gate.signal.value,
              force: expression.gate.signal.force === true ? true : undefined,
            }
          : baseline.gate.signal,
        impulse.gate?.signal
          ? {
              value: impulse.gate.signal.value,
              force: impulse.gate.signal.force === true ? true : undefined,
            }
          : baseline.gate.signal,
        call.gate?.signal
          ? {
              value: call.gate.signal.value,
              force: call.gate.signal.force === true ? true : undefined,
            }
          : baseline.gate.signal,
      ]),
      flags: resolveDim([
        baseline.gate.flags,
        expression.gate?.flags
          ? {
              value: expression.gate.flags.value,
              force: expression.gate.flags.force === true ? true : undefined,
            }
          : baseline.gate.flags,
        impulse.gate?.flags
          ? {
              value: impulse.gate.flags.value,
              force: impulse.gate.flags.force === true ? true : undefined,
            }
          : baseline.gate.flags,
        call.gate?.flags
          ? {
              value: call.gate.flags.value,
              force: call.gate.flags.force === true ? true : undefined,
            }
          : baseline.gate.flags,
      ]),
    },
  };
}

/**
 * Stateful defaults patch helper (`run.set({ defaults: ... })` style).
 */
export function setDefaults(current: Defaults, patch: SetDefaults): Defaults {
  return resolveDefaults({
    baseline: current,
    callOverrides: patch,
  });
}
