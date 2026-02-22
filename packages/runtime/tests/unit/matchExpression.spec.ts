import { describe, expect, it } from "vitest";

import {
  matchExpression,
  type FlagsView,
  type MatchExpressionInput,
} from "../../src/match/matchExpression.js";

const flags = (...list: string[]): FlagsView => ({
  list,
  map: Object.fromEntries(list.map((flag) => [flag, true])) as Record<
    string,
    true
  >,
});

const baseInput = (): MatchExpressionInput => ({
  expression: {
    signal: "go",
    flags: [{ flag: "a", value: true }],
  },
  defaults: {
    gate: {
      signal: { value: true },
      flags: { value: true },
    },
  },
  fallbackReference: {
    signal: "go",
    flags: flags("a"),
    changedFlags: flags("a"),
  },
});

describe("matchExpression", () => {
  it("uses fallback reference values when reference is omitted", () => {
    expect(matchExpression(baseInput())).toBe(true);
  });

  it("uses call changedFlags as highest-precedence fixed input", () => {
    const input = baseInput();
    input.reference = { changedFlags: flags("z") };
    input.changedFlags = flags("a");

    expect(matchExpression(input)).toBe(true);
  });

  it("disables signal gate when gate.signal is false", () => {
    const input = baseInput();
    input.gate = { signal: false };
    input.fallbackReference = {
      ...input.fallbackReference,
      signal: "other",
    };

    expect(matchExpression(input)).toBe(true);
  });

  it("disables flags gate when gate.flags is false", () => {
    const input = baseInput();
    input.gate = { flags: false };
    input.fallbackReference = {
      signal: "go",
      flags: flags(),
      changedFlags: flags(),
    };

    expect(matchExpression(input)).toBe(true);
  });

  it("keeps specCount=0 matching spec-based instead of deriving from reference flags", () => {
    const input: MatchExpressionInput = {
      expression: {},
      defaults: {
        gate: {
          signal: { value: true },
          flags: { value: true },
        },
      },
      fallbackReference: {
        signal: "go",
        flags: flags("a", "b"),
        changedFlags: flags("a"),
      },
    };

    expect(matchExpression(input)).toBe(true);
  });

  it("clamps max threshold to specCount for specCount=0", () => {
    const input: MatchExpressionInput = {
      expression: {
        required: { flags: { max: 0 } },
      },
      defaults: {
        gate: {
          signal: { value: true },
          flags: { value: true },
        },
      },
      reference: {
        flags: flags("a", "b"),
      },
    };

    expect(matchExpression(input)).toBe(true);
  });

  it("clamps changed threshold to specCount for specCount=0", () => {
    const input: MatchExpressionInput = {
      expression: {
        required: { flags: { changed: 5 } },
      },
      defaults: {
        gate: {
          signal: { value: true },
          flags: { value: true },
        },
      },
      reference: {
        changedFlags: flags("a"),
      },
    };

    expect(matchExpression(input)).toBe(true);
  });
  it("supports changed=0 by disabling changed threshold", () => {
    const input = baseInput();
    input.expression.required = { flags: { changed: 0 } };
    input.fallbackReference = {
      signal: "go",
      flags: flags("a"),
      changedFlags: flags(),
    };

    expect(matchExpression(input)).toBe(true);
  });

  it("clamps min/max/changed thresholds into [0, specCount]", () => {
    const input = baseInput();
    input.expression.flags = [
      { flag: "a", value: true },
      { flag: "b", value: true },
    ];
    input.expression.required = {
      flags: {
        min: -5,
        max: 99,
        changed: 8,
      },
    };
    input.fallbackReference = {
      signal: "go",
      flags: flags("a", "b"),
      changedFlags: flags("a"),
    };

    expect(matchExpression(input)).toBe(false);
  });
});
