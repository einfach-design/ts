/**
 * @file packages/runtime/tests/conformance/matchExpression.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 *
 * P0 Conformance: matchExpression wrapper behavior
 *
 * Spec refs:
 * - §4.6 matchExpression
 */

import { describe, it, expect } from "vitest";
import { createRuntime } from "../../src/index.js";
import type { MatchExpressionInput } from "../../src/match/matchExpression.js";

describe("conformance/matchExpression", () => {
  it("D — wrapper should resolve defaults/reference from runtime when omitted (Spec §4.6)", () => {
    const run = createRuntime();

    // establish a runtime reference (flags + signal) via public API
    run.impulse({ signals: ["sig:one"], addFlags: ["f1"] } as unknown);

    // Per spec, the wrapper should fill in defaults + reference from runtime state
    // when input omits them. Current impl may throw (red) — keep strict.
    const result = run.matchExpression({
      expression: {
        // requires at least 1 flag; should match because runtime has f1
        required: { flags: { min: 1 } },
      },
    } as MatchExpressionInput);

    expect(result).toBe(true);
  });

  it("D — own-property semantics: gate.flags should only apply when set as own-property (Spec §4.6)", () => {
    const run = createRuntime();

    const baseInput = {
      expression: {
        flags: [{ flag: "a", value: true }],
        required: { flags: { min: 1 } },
      },
      reference: {
        flags: { map: {}, list: [] },
      },
      defaults: { gate: { signal: { value: true }, flags: { value: false } } },
    };

    const matchWithoutOwnFlags = run.matchExpression({
      ...baseInput,
      gate: {},
    } as MatchExpressionInput);

    const matchWithOwnFlags = run.matchExpression({
      ...baseInput,
      gate: { flags: true },
    } as MatchExpressionInput);

    expect(matchWithoutOwnFlags).toBe(true);
    expect(matchWithOwnFlags).toBe(false);
  });
});
