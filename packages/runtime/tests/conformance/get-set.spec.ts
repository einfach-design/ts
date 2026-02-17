/**
 * @file packages/runtime/tests/conformance/get-set.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 *
 * P0 Conformance: get/set behaviors
 *
 * Spec refs:
 * - §4.1 get
 * - §4.2 set
 * - §6.2 changedFlags/delta
 */
import { describe, it, expect } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/get-set", () => {
  it("A1 — get(unknown) must throw (Spec §4.1)", () => {
    const run = createRuntime();
    expect(() => run.get("unknown-key" as any)).toThrow();
  });

  it.todo(
    "A2 — scope projection: applied vs pending vs pendingOnly (Spec §4.1)",
    () => {
      // TODO(Spec §4.1): Create a public-API-only scenario with pending state:
      // - applied state differs from pending
      // - pendingOnly returns only pending entries
      // Current public API always drains impulses immediately; once a non-draining option exists,
      // replace this todo with a runnable state-machine test.
    },
  );

  it("B1 — set(flagsTruth) must not compute changedFlags implicitly (Spec §4.2)", () => {
    const run = createRuntime();

    // baseline flags
    run.set({
      flags: { list: ["a"], map: { a: true } },
    } as any);

    // update flags truth without explicitly setting changedFlags
    run.set({
      flags: { list: ["a", "b"], map: { a: true, b: true } },
    } as any);

    const changed = run.get("changedFlags" as any) as any;

    // Spec expectation: changedFlags must NOT be auto-diffed when only flagsTruth is patched.
    // Fail if "b" appears implicitly.
    const changedList: string[] =
      changed &&
      typeof changed === "object" &&
      Array.isArray((changed as any).list)
        ? (changed as any).list
        : [];

    expect(changedList).not.toContain("b");
  });

  it("B2 — set must reject invalid patch shapes (Spec §4.2)", () => {
    const run = createRuntime();

    // forbidden queue mutation (should throw per spec)
    expect(() =>
      run.set({ impulseQ: { q: { entries: [] } } } as any),
    ).toThrow();

    // unknown keys must be rejected (should throw per spec)
    expect(() => run.set({ totallyUnknownKey: 123 } as any)).toThrow();
  });
});
