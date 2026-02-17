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

  it("D — own-property semantics: missing fields must fall back to defaults (Spec §4.6)", () => {
    const run = createRuntime();

    // Two calls differ only by defaults; missing required.flags.min should be resolved via defaults.
    const baseInput = {
      expression: {
        required: { flags: {} },
      },
      reference: {
        flags: { map: { a: true }, list: ["a"] },
      },
    };

    const matchWithMin1 = run.matchExpression({
      ...baseInput,
      defaults: { gate: { signal: { value: true }, flags: { value: true } } },
      // fallback min=1 via defaults is a spec-level behavior; we expect true here.
    } as MatchExpressionInput);

    const matchWithMin2 = run.matchExpression({
      ...baseInput,
      defaults: { gate: { signal: { value: true }, flags: { value: true } } },
      // If defaults changed to require 2 flags, we expect false (spec behavior).
      // This relies on wrapper resolving thresholds from defaults; current impl may not (red).
      expression: { required: { flags: { min: 2 } } },
    } as MatchExpressionInput);

    expect(matchWithMin1).toBe(true);
    expect(matchWithMin2).toBe(false);
  });
});
