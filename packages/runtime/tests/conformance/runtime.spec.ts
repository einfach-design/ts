/**
 * @file packages/runtime/tests/conformance/runtime.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 *
 * P0 Conformance: runtime semantics (runs + delta rules)
 *
 * Spec refs:
 * - §6.2 changedFlags/delta (remove-wins)
 * - §10 runs/backfill (Impl doc proxy tests)
 */
import { describe, it, expect } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/runtime", () => {
  it("C — delta semantics: remove wins within same impulse (Spec §6.2)", () => {
    const run = createRuntime();

    // establish a base flag
    run.set({ addFlags: ["x"] } as any);

    // add and remove the same flag in the same impulse => remove wins => absent
    run.impulse({ addFlags: ["y"], removeFlags: ["y"] } as any);

    const flags = run.get("flags" as any) as any;
    const list: string[] = Array.isArray(flags?.list) ? flags.list : [];
    expect(list).not.toContain("y");
  });

  it("E1 — targets receive (i, a, r) with usable i-fields (Spec §10)", () => {
    const run = createRuntime();

    let captured: any = undefined;

    run.add({
      id: "expr:e1",
      targets: [
        (i: any, a: any, r: any) => {
          captured = { i, a, r };
        },
      ],
    } as any);

    run.impulse({ addFlags: ["alpha"] } as any);

    expect(captured).toBeTruthy();
    expect(captured.a?.id).toBe("expr:e1");
    expect(typeof captured.r?.get).toBe("function");
    expect(typeof captured.r?.matchExpression).toBe("function");
    expect(captured.i?.flags).toBeTruthy();
    // signal is optional; if present it must match runtime signal
    if (captured.i?.signal !== undefined) {
      expect(typeof captured.i.signal).toBe("string");
    }
  });
});
