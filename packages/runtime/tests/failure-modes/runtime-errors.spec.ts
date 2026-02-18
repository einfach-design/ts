/**
 * @file packages/runtime/tests/failure-modes/runtime-errors.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Failure-mode coverage for runtime onError and diagnostic paths.
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("failure-modes/runtime-errors", () => {
  it("reports target phase via diagnostics when dispatch fails (Spec §8.1, §8.2)", () => {
    const run = createRuntime();
    const phases: string[] = [];

    run.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "runtime.target.error") {
        phases.push(String(diagnostic.data?.phase));
      }
    });

    run.add({
      id: "expr:target-phase",
      onError: "report",
      targets: [
        () => {
          throw new Error("target boom");
        },
      ],
    });

    run.impulse({ addFlags: ["a"] });

    expect(phases).toContain("target/callback");
  });

  it("expression.onError=throw aborts drain and propagates target exceptions", () => {
    const run = createRuntime();

    run.add({
      id: "expr:throw",
      onError: "throw",
      targets: [
        () => {
          throw new Error("target throw");
        },
      ],
    });

    expect(() => run.impulse({ addFlags: ["a"] })).toThrow("target throw");

    const impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      q: { cursor: number; entries: unknown[] };
    };

    expect(impulseQ.q.cursor).toBe(0);
    expect(impulseQ.q.entries).toHaveLength(1);
  });

  it("invalid impulse canon follows ImpulseOpts.onError modes", () => {
    const reported = createRuntime();
    const reportDiags: Array<{ code: string; data?: Record<string, unknown> }> =
      [];
    reported.onDiagnostic((diagnostic) => reportDiags.push(diagnostic));
    expect(() =>
      reported.impulse({ signals: "bad", onError: "report" } as Record<
        string,
        unknown
      >),
    ).not.toThrow();
    expect(reportDiags).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "impulse.input.invalid",
          data: expect.objectContaining({ phase: "impulse/canon" }),
        }),
      ]),
    );

    const swallowed = createRuntime();
    expect(() =>
      swallowed.impulse({ signals: "bad", onError: "swallow" } as Record<
        string,
        unknown
      >),
    ).not.toThrow();

    const throwing = createRuntime();
    expect(() =>
      throwing.impulse({ signals: "bad", onError: "throw" } as Record<
        string,
        unknown
      >),
    ).toThrow("impulse.input.invalid");

    const fn = createRuntime();
    expect(() =>
      fn.impulse({
        signals: "bad",
        onError: () => {
          throw new Error("from-onError-fn");
        },
      } as Record<string, unknown>),
    ).toThrow("from-onError-fn");
  });

  it("routes listener exceptions to impulseQ onError callback (Spec §8.1, §8.2)", () => {
    const run = createRuntime();
    const seen: unknown[] = [];

    run.set({
      impulseQ: {
        config: {
          onError: (error: unknown) => {
            seen.push(error);
          },
        },
      },
    });

    run.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "runtime.target.error") {
        throw new Error("listener boom");
      }
    });

    run.add({
      id: "expr:listener-phase",
      onError: "report",
      targets: [
        () => {
          throw new Error("target boom");
        },
      ],
    });

    run.impulse({ addFlags: ["a"] });

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toBeInstanceOf(Error);
    expect((seen[0] as Error).message).toBe("listener boom");
  });
});
