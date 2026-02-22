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

export type MethodName = "on" | "when";

type MethodDefaultsScope =
  | Scope
  | Readonly<{
      signal?: Scope | SetDefaultsDimScope;
      flags?: Scope | SetDefaultsDimScope;
    }>;

type MethodDefaultsGate =
  | boolean
  | Readonly<{
      signal?: boolean | SetDefaultsDimGate;
      flags?: boolean | SetDefaultsDimGate;
    }>;

export type MethodDefaultsEntry = Readonly<{
  runs?: Readonly<{ max?: number }>;
  required?: Readonly<{
    flags?: Readonly<{ min?: number; max?: number; changed?: number }>;
  }>;
  backfill?: Readonly<{
    signal?: Readonly<{ runs?: Readonly<{ max?: number }> }>;
    flags?: Readonly<{ runs?: Readonly<{ max?: number }> }>;
  }>;
  scope?: MethodDefaultsScope;
  gate?: MethodDefaultsGate;
  retroactive?: boolean;
}>;

export type MethodDefaults = Readonly<{
  on: MethodDefaultsEntry;
  when: MethodDefaultsEntry;
}>;

export type SetMethodDefaults = Readonly<{
  on?: MethodDefaultsEntry;
  when?: MethodDefaultsEntry;
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
  methods: MethodDefaults;
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
  methods?: SetMethodDefaults;
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

  if (typeof source.value !== "boolean") {
    throw new Error(`${context}.value must be boolean.`);
  }

  return {
    value: source.value,
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
  methods?: {
    on?: MethodDefaultsEntry;
    when?: MethodDefaultsEntry;
  };
};

const assertNumber = (value: unknown, context: string): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${context} must be number.`);
  }

  return value;
};

const canonicalRunsMax = (value: unknown, context: string): number => {
  const resolved = assertNumber(value, context);

  if (Number.isFinite(resolved)) {
    return Math.max(1, Math.floor(resolved));
  }

  if (resolved === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  throw new Error(`${context} must be finite or Infinity.`);
};

const canonicalRequiredFlagsValue = (
  value: unknown,
  context: string,
): number => {
  const resolved = assertNumber(value, context);

  if (Number.isFinite(resolved) === false) {
    throw new Error(`${context} must be finite number.`);
  }

  return Math.max(0, Math.floor(resolved));
};

const canonicalMethodScope = (
  source: Exclude<SetDefaults["scope"], undefined>,
  context: string,
): MethodDefaultsScope => {
  if (typeof source === "string") {
    return canonicalScopeDim(source, context).value;
  }

  if (!isRecord(source)) {
    throw new Error(`${context} must be Scope or object.`);
  }

  assertValidPresentValue(source, "signal", `${context}.signal`);
  assertValidPresentValue(source, "flags", `${context}.flags`);

  const out: {
    signal?: SetDefaultsDimScope;
    flags?: SetDefaultsDimScope;
  } = {};

  if (hasOwn(source, "signal")) {
    const canonical = canonicalScopeDim(
      source.signal as Scope | SetDefaultsDimScope,
      `${context}.signal`,
    );
    out.signal = {
      value: canonical.value,
      ...(canonical.force === true ? { force: true } : {}),
    };
  }

  if (hasOwn(source, "flags")) {
    const canonical = canonicalScopeDim(
      source.flags as Scope | SetDefaultsDimScope,
      `${context}.flags`,
    );
    out.flags = {
      value: canonical.value,
      ...(canonical.force === true ? { force: true } : {}),
    };
  }

  return out;
};

const canonicalMethodGate = (
  source: Exclude<SetDefaults["gate"], undefined>,
  context: string,
): MethodDefaultsGate => {
  if (typeof source === "boolean") {
    return source;
  }

  if (!isRecord(source)) {
    throw new Error(`${context} must be boolean or object.`);
  }

  assertValidPresentValue(source, "signal", `${context}.signal`);
  assertValidPresentValue(source, "flags", `${context}.flags`);

  const out: {
    signal?: SetDefaultsDimGate;
    flags?: SetDefaultsDimGate;
  } = {};

  if (hasOwn(source, "signal")) {
    const canonical = canonicalGateDim(
      source.signal as boolean | SetDefaultsDimGate,
      `${context}.signal`,
    );
    out.signal = {
      value: canonical.value,
      ...(canonical.force === true ? { force: true } : {}),
    };
  }

  if (hasOwn(source, "flags")) {
    const canonical = canonicalGateDim(
      source.flags as boolean | SetDefaultsDimGate,
      `${context}.flags`,
    );
    out.flags = {
      value: canonical.value,
      ...(canonical.force === true ? { force: true } : {}),
    };
  }

  return out;
};

const canonicalMethodDefaultsEntry = (
  source: unknown,
  context: string,
): MethodDefaultsEntry => {
  if (!isRecord(source)) {
    throw new Error(`${context} must be object.`);
  }

  assertValidPresentValue(source, "runs", `${context}.runs`);
  assertValidPresentValue(source, "required", `${context}.required`);
  assertValidPresentValue(source, "backfill", `${context}.backfill`);
  assertValidPresentValue(source, "scope", `${context}.scope`);
  assertValidPresentValue(source, "gate", `${context}.gate`);
  assertValidPresentValue(source, "retroactive", `${context}.retroactive`);

  if (
    hasOwn(source, "signals") ||
    hasOwn(source, "flags") ||
    hasOwn(source, "targets")
  ) {
    throw new Error(`${context} must not contain signals/flags/targets.`);
  }

  for (const key of Object.keys(source)) {
    if (
      key !== "runs" &&
      key !== "required" &&
      key !== "backfill" &&
      key !== "scope" &&
      key !== "gate" &&
      key !== "retroactive"
    ) {
      throw new Error(`${context}.${key} is not supported.`);
    }
  }

  const out: {
    runs?: { max?: number };
    required?: { flags?: { min?: number; max?: number; changed?: number } };
    backfill?: {
      signal?: { runs?: { max?: number } };
      flags?: { runs?: { max?: number } };
    };
    scope?: MethodDefaultsScope;
    gate?: MethodDefaultsGate;
    retroactive?: boolean;
  } = {};

  if (hasOwn(source, "runs")) {
    if (!isRecord(source.runs)) {
      throw new Error(`${context}.runs must be object.`);
    }

    assertValidPresentValue(source.runs, "max", `${context}.runs.max`);
    out.runs = {};
    if (hasOwn(source.runs, "max")) {
      out.runs.max = canonicalRunsMax(source.runs.max, `${context}.runs.max`);
    }
  }

  if (hasOwn(source, "required")) {
    if (!isRecord(source.required)) {
      throw new Error(`${context}.required must be object.`);
    }

    assertValidPresentValue(
      source.required,
      "flags",
      `${context}.required.flags`,
    );
    out.required = {};

    if (hasOwn(source.required, "flags")) {
      if (!isRecord(source.required.flags)) {
        throw new Error(`${context}.required.flags must be object.`);
      }

      assertValidPresentValue(
        source.required.flags,
        "min",
        `${context}.required.flags.min`,
      );
      assertValidPresentValue(
        source.required.flags,
        "max",
        `${context}.required.flags.max`,
      );
      assertValidPresentValue(
        source.required.flags,
        "changed",
        `${context}.required.flags.changed`,
      );

      out.required.flags = {};
      if (hasOwn(source.required.flags, "min")) {
        out.required.flags.min = canonicalRequiredFlagsValue(
          source.required.flags.min,
          `${context}.required.flags.min`,
        );
      }
      if (hasOwn(source.required.flags, "max")) {
        out.required.flags.max = canonicalRequiredFlagsValue(
          source.required.flags.max,
          `${context}.required.flags.max`,
        );
      }
      if (hasOwn(source.required.flags, "changed")) {
        out.required.flags.changed = canonicalRequiredFlagsValue(
          source.required.flags.changed,
          `${context}.required.flags.changed`,
        );
      }
    }
  }

  if (hasOwn(source, "backfill")) {
    if (!isRecord(source.backfill)) {
      throw new Error(`${context}.backfill must be object.`);
    }

    assertValidPresentValue(
      source.backfill,
      "signal",
      `${context}.backfill.signal`,
    );
    assertValidPresentValue(
      source.backfill,
      "flags",
      `${context}.backfill.flags`,
    );

    out.backfill = {};

    for (const dim of ["signal", "flags"] as const) {
      if (!hasOwn(source.backfill, dim)) {
        continue;
      }

      const value = source.backfill[dim];
      if (!isRecord(value)) {
        throw new Error(`${context}.backfill.${dim} must be object.`);
      }

      assertValidPresentValue(value, "runs", `${context}.backfill.${dim}.runs`);

      const dimOut: { runs?: { max?: number } } = {};
      if (hasOwn(value, "runs")) {
        if (!isRecord(value.runs)) {
          throw new Error(`${context}.backfill.${dim}.runs must be object.`);
        }

        assertValidPresentValue(
          value.runs,
          "max",
          `${context}.backfill.${dim}.runs.max`,
        );
        dimOut.runs = {};
        if (hasOwn(value.runs, "max")) {
          dimOut.runs.max = canonicalRunsMax(
            value.runs.max,
            `${context}.backfill.${dim}.runs.max`,
          );
        }
      }

      out.backfill[dim] = dimOut;
    }
  }

  if (hasOwn(source, "scope")) {
    out.scope = canonicalMethodScope(
      source.scope as Exclude<SetDefaults["scope"], undefined>,
      `${context}.scope`,
    );
  }

  if (hasOwn(source, "gate")) {
    out.gate = canonicalMethodGate(
      source.gate as Exclude<SetDefaults["gate"], undefined>,
      `${context}.gate`,
    );
  }

  if (hasOwn(source, "retroactive")) {
    if (typeof source.retroactive !== "boolean") {
      throw new Error(`${context}.retroactive must be boolean.`);
    }
    out.retroactive = source.retroactive;
  }

  return out;
};

const cloneMethodDefaultsEntry = (
  entry: MethodDefaultsEntry,
): MethodDefaultsEntry => {
  const out: {
    runs?: { max?: number };
    required?: { flags?: { min?: number; max?: number; changed?: number } };
    backfill?: {
      signal?: { runs?: { max?: number } };
      flags?: { runs?: { max?: number } };
    };
    scope?: MethodDefaultsScope;
    gate?: MethodDefaultsGate;
    retroactive?: boolean;
  } = {};

  if (hasOwn(entry, "runs")) {
    out.runs = { ...(entry.runs ?? {}) };
  }
  if (hasOwn(entry, "required")) {
    out.required = {};
    if (entry.required !== undefined && hasOwn(entry.required, "flags")) {
      out.required.flags = { ...(entry.required.flags ?? {}) };
    }
  }
  if (hasOwn(entry, "backfill")) {
    out.backfill = {};
    if (entry.backfill !== undefined && hasOwn(entry.backfill, "signal")) {
      out.backfill.signal = {};
      if (
        entry.backfill.signal !== undefined &&
        hasOwn(entry.backfill.signal, "runs")
      ) {
        out.backfill.signal.runs = { ...(entry.backfill.signal.runs ?? {}) };
      }
    }
    if (entry.backfill !== undefined && hasOwn(entry.backfill, "flags")) {
      out.backfill.flags = {};
      if (
        entry.backfill.flags !== undefined &&
        hasOwn(entry.backfill.flags, "runs")
      ) {
        out.backfill.flags.runs = { ...(entry.backfill.flags.runs ?? {}) };
      }
    }
  }
  if (hasOwn(entry, "scope")) {
    if (typeof entry.scope === "string") {
      out.scope = entry.scope;
    } else if (entry.scope !== undefined) {
      const scopeOut: {
        signal?: Scope | SetDefaultsDimScope;
        flags?: Scope | SetDefaultsDimScope;
      } = {};
      if (hasOwn(entry.scope, "signal") && entry.scope.signal !== undefined) {
        scopeOut.signal =
          typeof entry.scope.signal === "string"
            ? entry.scope.signal
            : { ...entry.scope.signal };
      }
      if (hasOwn(entry.scope, "flags") && entry.scope.flags !== undefined) {
        scopeOut.flags =
          typeof entry.scope.flags === "string"
            ? entry.scope.flags
            : { ...entry.scope.flags };
      }
      out.scope = scopeOut;
    }
  }
  if (hasOwn(entry, "gate")) {
    if (typeof entry.gate === "boolean") {
      out.gate = entry.gate;
    } else if (entry.gate !== undefined) {
      const gateOut: {
        signal?: boolean | SetDefaultsDimGate;
        flags?: boolean | SetDefaultsDimGate;
      } = {};
      if (hasOwn(entry.gate, "signal") && entry.gate.signal !== undefined) {
        gateOut.signal =
          typeof entry.gate.signal === "boolean"
            ? entry.gate.signal
            : { ...entry.gate.signal };
      }
      if (hasOwn(entry.gate, "flags") && entry.gate.flags !== undefined) {
        gateOut.flags =
          typeof entry.gate.flags === "boolean"
            ? entry.gate.flags
            : { ...entry.gate.flags };
      }
      out.gate = gateOut;
    }
  }
  if (hasOwn(entry, "retroactive")) {
    if (entry.retroactive !== undefined) {
      out.retroactive = entry.retroactive;
    }
  }

  return out;
};

const mergeMethodDefaultsEntry = (
  baseline: MethodDefaultsEntry,
  override: MethodDefaultsEntry | undefined,
): MethodDefaultsEntry => {
  if (override === undefined) {
    return cloneMethodDefaultsEntry(baseline);
  }

  const out = cloneMethodDefaultsEntry(baseline) as {
    runs?: { max?: number };
    required?: { flags?: { min?: number; max?: number; changed?: number } };
    backfill?: {
      signal?: { runs?: { max?: number } };
      flags?: { runs?: { max?: number } };
    };
    scope?: MethodDefaultsScope;
    gate?: MethodDefaultsGate;
    retroactive?: boolean;
  };

  if (hasOwn(override, "runs")) {
    out.runs = {
      ...(out.runs ?? {}),
      ...(override.runs ?? {}),
    };
  }

  if (hasOwn(override, "required")) {
    out.required = {
      ...(out.required ?? {}),
      ...(override.required ?? {}),
    };

    if (override.required !== undefined && hasOwn(override.required, "flags")) {
      out.required.flags = {
        ...(out.required.flags ?? {}),
        ...(override.required.flags ?? {}),
      };
    }
  }

  if (hasOwn(override, "backfill")) {
    out.backfill = {
      ...(out.backfill ?? {}),
      ...(override.backfill ?? {}),
    };

    if (
      override.backfill !== undefined &&
      hasOwn(override.backfill, "signal")
    ) {
      out.backfill.signal = {
        ...(out.backfill.signal ?? {}),
        ...(override.backfill.signal ?? {}),
      };

      if (
        override.backfill.signal !== undefined &&
        hasOwn(override.backfill.signal, "runs")
      ) {
        out.backfill.signal.runs = {
          ...(out.backfill.signal.runs ?? {}),
          ...(override.backfill.signal.runs ?? {}),
        };
      }
    }

    if (override.backfill !== undefined && hasOwn(override.backfill, "flags")) {
      out.backfill.flags = {
        ...(out.backfill.flags ?? {}),
        ...(override.backfill.flags ?? {}),
      };

      if (
        override.backfill.flags !== undefined &&
        hasOwn(override.backfill.flags, "runs")
      ) {
        out.backfill.flags.runs = {
          ...(out.backfill.flags.runs ?? {}),
          ...(override.backfill.flags.runs ?? {}),
        };
      }
    }
  }

  if (hasOwn(override, "scope")) {
    if (typeof override.scope === "string") {
      out.scope = override.scope;
    } else if (override.scope !== undefined) {
      if (typeof out.scope === "string" || out.scope === undefined) {
        out.scope = {};
      }

      out.scope = {
        ...(out.scope as Exclude<MethodDefaultsScope, Scope>),
        ...override.scope,
      };
    }
  }

  if (hasOwn(override, "gate")) {
    if (typeof override.gate === "boolean") {
      out.gate = override.gate;
    } else if (override.gate !== undefined) {
      if (typeof out.gate === "boolean" || out.gate === undefined) {
        out.gate = {};
      }

      out.gate = {
        ...(out.gate as Exclude<MethodDefaultsGate, boolean>),
        ...override.gate,
      };
    }
  }

  if (hasOwn(override, "retroactive") && override.retroactive !== undefined) {
    out.retroactive = override.retroactive;
  }

  return out;
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
  assertValidPresentValue(input, "methods", "defaults.methods");

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

  if (hasOwn(input, "methods")) {
    if (!isRecord(input.methods)) {
      throw new Error("defaults.methods must be object.");
    }

    assertValidPresentValue(input.methods, "on", "defaults.methods.on");
    assertValidPresentValue(input.methods, "when", "defaults.methods.when");

    output.methods = {};

    if (hasOwn(input.methods, "on")) {
      output.methods.on = canonicalMethodDefaultsEntry(
        input.methods.on,
        "defaults.methods.on",
      );
    }

    if (hasOwn(input.methods, "when")) {
      output.methods.when = canonicalMethodDefaultsEntry(
        input.methods.when,
        "defaults.methods.when",
      );
    }
  }

  return output;
}

/**
 * Baseline defaults as required by the Runtime specification.
 */
const globalDefaultsBase: {
  scope: Defaults["scope"];
  gate: Defaults["gate"];
  methods?: MethodDefaults;
} = {
  scope: {
    signal: { value: "applied", force: undefined },
    flags: { value: "applied", force: undefined },
  },
  gate: {
    signal: { value: true, force: undefined },
    flags: { value: true, force: undefined },
  },
};

Object.defineProperty(globalDefaultsBase, "methods", {
  value: {
    on: {},
    when: {},
  },
  enumerable: false,
  writable: false,
  configurable: false,
});

export const globalDefaults: Defaults = globalDefaultsBase as Defaults;

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
    methods: !hasOwn(call, "methods")
      ? {
          on: cloneMethodDefaultsEntry(baseline.methods.on),
          when: cloneMethodDefaultsEntry(baseline.methods.when),
        }
      : {
          on:
            call.methods !== undefined && hasOwn(call.methods, "on")
              ? mergeMethodDefaultsEntry(baseline.methods.on, call.methods.on)
              : cloneMethodDefaultsEntry(baseline.methods.on),
          when:
            call.methods !== undefined && hasOwn(call.methods, "when")
              ? mergeMethodDefaultsEntry(
                  baseline.methods.when,
                  call.methods.when,
                )
              : cloneMethodDefaultsEntry(baseline.methods.when),
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
