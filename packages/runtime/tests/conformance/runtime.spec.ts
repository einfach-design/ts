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
    run.set({ addFlags: ["x"] } as Record<string, unknown>);

    // add and remove the same flag in the same impulse => remove wins => absent
    run.impulse({
      addFlags: ["y"],
      removeFlags: ["y"],
    } as Record<string, unknown>);

    const flags = run.get("flags" as string | undefined) as unknown;

    const listValue =
      flags && typeof flags === "object"
        ? (flags as Record<string, unknown>).list
        : undefined;

    const list: string[] = Array.isArray(listValue) ? (listValue as string[]) : [];
    expect(list).not.toContain("y");
  });

  it("E1 — targets receive (i, a, r) with usable i-fields (Spec §10)", () => {
    const run = createRuntime();

    let captured:
      | {
          i: Record<string, unknown>;
          a: Record<string, unknown>;
          r: Record<string, unknown>;
        }
      | undefined;

    run.add({
      id: "expr:e1",
      targets: [
        (i: unknown, a: unknown, r: unknown) => {
          captured = {
            i: (i && typeof i === "object" ? (i as Record<string, unknown>) : {}) as Record<
              string,
              unknown
            >,
            a: (a && typeof a === "object" ? (a as Record<string, unknown>) : {}) as Record<
              string,
              unknown
            >,
            r: (r && typeof r === "object" ? (r as Record<string, unknown>) : {}) as Record<
              string,
              unknown
            >,
          };
        },
      ],
    });

    run.impulse({ addFlags: ["alpha"] } as Record<string, unknown>);

    expect(captured).toBeTruthy();

    const cap = captured as NonNullable<typeof captured>;

    expect(cap.a.id).toBe("expr:e1");
    expect(typeof cap.r.get).toBe("function");
    expect(typeof cap.r.matchExpression).toBe("function");
    expect(cap.i.flags).toBeTruthy();

    // signal is optional; if present it must match runtime signal
    const sig = cap.i.signal;
    if (sig !== undefined) {
      expect(typeof sig).toBe("string");
    }
  });
});
