import { describe, expect, it } from "vitest";

import {
  globalDefaults,
  resolveDefaults,
  setDefaults,
} from "../../../src/state/defaults.js";

describe("defaults", () => {
  it("exposes the spec baseline in globalDefaults", () => {
    expect(globalDefaults).toEqual({
      scope: {
        signal: { value: "applied", force: undefined },
        flags: { value: "applied", force: undefined },
      },
      gate: {
        signal: { value: true, force: undefined },
        flags: { value: true, force: undefined },
      },
    });
  });

  it("canonicalizes scalar scope/gate overrides", () => {
    const result = resolveDefaults({
      callOverrides: {
        scope: "pending",
        gate: false,
      },
    });

    expect(result.scope.signal.value).toBe("pending");
    expect(result.scope.flags.value).toBe("pending");
    expect(result.gate.signal.value).toBe(false);
    expect(result.gate.flags.value).toBe(false);
  });

  it("applies force filter per field", () => {
    const result = resolveDefaults({
      expressionOverrides: {
        scope: {
          signal: {
            value: "pendingOnly",
            force: true,
          },
        },
      },
      callOverrides: {
        scope: {
          signal: "pending",
          flags: "pending",
        },
      },
    });

    expect(result.scope.signal).toEqual({
      value: "pendingOnly",
      force: true,
    });
    expect(result.scope.flags).toEqual({
      value: "pending",
      force: undefined,
    });
  });

  it("supports stateful patching via setDefaults", () => {
    const next = setDefaults(globalDefaults, {
      gate: {
        flags: {
          value: false,
          force: true,
        },
      },
    });

    expect(next.gate.flags).toEqual({ value: false, force: true });
    expect(next.gate.signal).toEqual({ value: true, force: undefined });
  });

  it("canonicalizes methods numeric fields to runtime-safe integers", () => {
    const result = resolveDefaults({
      callOverrides: {
        methods: {
          on: {
            runs: { max: 2.8 },
            required: { flags: { min: 1.9, max: -4.2, changed: 3.7 } },
            backfill: {
              signal: { runs: { max: 5.9 } },
              flags: { runs: { max: Number.POSITIVE_INFINITY } },
            },
          },
        },
      },
    });

    expect(result.methods.on.runs?.max).toBe(2);
    expect(result.methods.on.required?.flags).toEqual({
      min: 1,
      max: 0,
      changed: 3,
    });
    expect(result.methods.on.backfill?.signal?.runs?.max).toBe(5);
    expect(result.methods.on.backfill?.flags?.runs?.max).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("rejects invalid infinities for methods runs.max", () => {
    expect(() =>
      resolveDefaults({
        callOverrides: {
          methods: {
            on: {
              runs: { max: Number.NEGATIVE_INFINITY },
            },
          },
        },
      }),
    ).toThrow(/runs\.max/);
  });
  it("throws for invalid undefined/force:false", () => {
    expect(() =>
      resolveDefaults({
        callOverrides: {
          gate: {
            signal: {
              value: true,
              force: false,
            } as never,
          },
        },
      }),
    ).toThrow(/force/);

    expect(() =>
      resolveDefaults({
        callOverrides: {
          scope: undefined as never,
        },
      }),
    ).toThrow(/must not be undefined/);
  });
});
