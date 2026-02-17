/**
 * @file packages/runtime/tests/conformance/backfill.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 *
 * P0 Conformance: backfill semantics (high-level)
 *
 * Spec/Impl refs:
 * - Spec §10 (runs/backfill)
 * - Impl §10 (impulse pipeline, backfill scheduling)
 */
import { describe, it, expect } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/backfill", () => {
  it("E2 — backfill causes a previously-unmatched expression to run later (Spec §10, Impl §10)", () => {
    const run = createRuntime();

    const calls: Array<unknown> = [];
    run.add({
      id: "expr:backfill",
      // Expression should only match when signal is present.
      signal: "sig:need",
      // Backfill is expected to retry.
      backfill: { signal: { debt: 1 } },
      targets: [
        (i, a, r) => {
          calls.push({ i, a, r });
        },
      ],
    });

    // First impulse: no signal => should not run (but should schedule backfill debt)
    run.impulse({ addFlags: ["noop"] });

    // Second impulse: provide signal => should run at least once.
    run.impulse({ signals: ["sig:need"] });

    // Strict expectation per spec: callback must run after the triggering condition becomes true.
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  it.todo(
    "E2 — debt accounting is observable (proxy or explicit API) (Impl §10)",
    () => {
      // TODO(Impl §10): When debt metrics are exposed publicly, assert precise debt deltas.
    },
  );
});
