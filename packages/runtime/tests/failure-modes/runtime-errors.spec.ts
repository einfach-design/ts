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
      targets: [
        () => {
          throw new Error("target boom");
        },
      ],
    });

    run.impulse({ addFlags: ["a"] });

    expect(phases).toContain("target/callback");
  });

  it("onError=throw aborts drain and propagates target exceptions", () => {
    const run = createRuntime();

    run.set({
      impulseQ: {
        config: {
          onError: "throw",
        },
      },
    });

    run.add({
      id: "expr:throw",
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
      targets: [
        () => {
          throw new Error("target boom");
        },
      ],
    });

    run.impulse({ addFlags: ["a"] });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      context: { phase: "target/callback", targetKind: "callback" },
    });
    expect((seen[0] as { error: Error }).error.message).toBe("target boom");
  });

  it("listener errors use runtime onError modes consistently", () => {
    const reportRun = createRuntime();
    const reportCodes: string[] = [];
    reportRun.onDiagnostic((diagnostic) => {
      reportCodes.push(diagnostic.code);
      if (diagnostic.code === "impulse.input.invalid") {
        throw new Error("listener report");
      }
    });

    reportRun.set({ impulseQ: { config: { onError: "report" } } });
    expect(() =>
      reportRun.impulse({ signals: "bad" } as Record<string, unknown>),
    ).not.toThrow();
    expect(reportCodes).toContain("runtime.diagnostic.listenerError");

    const swallowRun = createRuntime();
    swallowRun.set({ impulseQ: { config: { onError: "swallow" } } });
    swallowRun.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "impulse.input.invalid") {
        throw new Error("listener swallow");
      }
    });
    expect(() =>
      swallowRun.impulse({ signals: "bad" } as Record<string, unknown>),
    ).not.toThrow();

    const throwRun = createRuntime();
    throwRun.set({ impulseQ: { config: { onError: "throw" } } });
    throwRun.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "impulse.input.invalid") {
        throw new Error("listener throw");
      }
    });
    expect(() =>
      throwRun.impulse({ signals: "bad" } as Record<string, unknown>),
    ).toThrow("listener throw");
  });

  it("propagates trim callback errors directly during run.set (Spec §4.2, §8.2)", () => {
    const run = createRuntime();

    run.impulse({ addFlags: ["a"] });

    expect(() =>
      run.set({
        impulseQ: {
          config: {
            maxBytes: 0,
            onTrim: () => {
              throw new Error("trim boom");
            },
          },
        },
      }),
    ).toThrow("trim boom");
  });
});
