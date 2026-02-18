/**
 * @file packages/runtime/tests/failure-modes/runtime-errors.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Failure-mode coverage for runtime onError and diagnostic paths.
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

/**
 * Spec matrix:
 * - §8.2 onError control flow: report/swallow/throw + function throw-through
 * - §8.2 scope & wrapping: inner throw must abort regardless of outer onError
 * - §8.3.1 object-target handler validation and dispatch error policy
 * - §4.3 diagnostics listener failure routing
 */
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
    expect(seen.some((error) => error instanceof Error)).toBe(true);
    expect(
      seen.some(
        (error) => error instanceof Error && error.message === "listener boom",
      ),
    ).toBe(true);
  });

  it("distinguishes report vs swallow for target errors", () => {
    const reportRun = createRuntime();
    const reportCodes: string[] = [];

    reportRun.onDiagnostic((diagnostic) => {
      reportCodes.push(diagnostic.code);
    });

    reportRun.add({
      id: "expr:report",
      onError: "report",
      targets: [
        () => {
          throw new Error("report-boom");
        },
      ],
    });

    expect(() => reportRun.impulse({ addFlags: ["a"] })).not.toThrow();
    expect(reportCodes).toContain("runtime.target.error");

    const swallowRun = createRuntime();
    const swallowCodes: string[] = [];

    swallowRun.onDiagnostic((diagnostic) => {
      swallowCodes.push(diagnostic.code);
    });

    swallowRun.add({
      id: "expr:swallow",
      onError: "swallow",
      targets: [
        () => {
          throw new Error("swallow-boom");
        },
      ],
    });

    expect(() => swallowRun.impulse({ addFlags: ["a"] })).not.toThrow();
    expect(swallowCodes).not.toContain("runtime.target.error");
  });

  it("inner throw aborts even when outer onError is swallow", () => {
    const run = createRuntime();
    const hits: string[] = [];

    run.add({
      id: "expr:inner-throw",
      onError: "throw",
      targets: [
        () => {
          hits.push("inner");
          throw new Error("inner-abort");
        },
      ],
    });

    expect(() =>
      run.impulse({ addFlags: ["a"], onError: "swallow" } as Record<
        string,
        unknown
      >),
    ).toThrow("inner-abort");
    expect(hits).toEqual(["inner"]);
  });

  it("object target missing handler follows report/swallow/throw modes", () => {
    const reportRun = createRuntime();
    const reportCodes: string[] = [];
    reportRun.onDiagnostic((diagnostic) => {
      reportCodes.push(diagnostic.code);
    });

    reportRun.add({
      id: "expr:obj-report",
      onError: "report",
      targets: [{ on: { everyRun: () => {} } }],
    });

    expect(() => reportRun.impulse({ signals: ["foo"] })).not.toThrow();
    expect(reportCodes).toContain("runtime.target.error");

    const swallowRun = createRuntime();
    const swallowCodes: string[] = [];
    swallowRun.onDiagnostic((diagnostic) => {
      swallowCodes.push(diagnostic.code);
    });

    swallowRun.add({
      id: "expr:obj-swallow",
      onError: "swallow",
      targets: [{ on: { everyRun: () => {} } }],
    });

    expect(() => swallowRun.impulse({ signals: ["foo"] })).not.toThrow();
    expect(swallowCodes).not.toContain("runtime.target.error");

    const throwRun = createRuntime();
    throwRun.add({
      id: "expr:obj-throw",
      onError: "throw",
      targets: [{ on: { everyRun: () => {} } }],
    });

    expect(() => throwRun.impulse({ signals: ["foo"] })).toThrow(
      'Object target is missing handler for signal "foo".',
    );
  });

  it("listener errors obey outer onError modes", () => {
    const reportRun = createRuntime();
    const reportCodes: string[] = [];

    reportRun.onDiagnostic((diagnostic) => {
      reportCodes.push(diagnostic.code);
    });
    reportRun.onDiagnostic(() => {
      throw new Error("listener-report");
    });

    expect(() =>
      reportRun.impulse({ signals: "bad", onError: "report" } as Record<
        string,
        unknown
      >),
    ).not.toThrow();
    expect(reportCodes).toContain("runtime.diagnostic.listenerError");

    const swallowRun = createRuntime();
    const swallowCodes: string[] = [];

    swallowRun.onDiagnostic((diagnostic) => {
      swallowCodes.push(diagnostic.code);
      if (diagnostic.code === "impulse.input.invalid") {
        throw new Error("listener-swallow");
      }
    });

    expect(() =>
      swallowRun.impulse({ signals: "bad", onError: "swallow" } as Record<
        string,
        unknown
      >),
    ).not.toThrow();
    expect(swallowCodes).not.toContain("runtime.diagnostic.listenerError");

    const throwRun = createRuntime();
    throwRun.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "runtime.target.error") {
        throw new Error("listener-throw");
      }
    });

    throwRun.add({
      id: "expr:listener-throw",
      onError: "report",
      targets: [
        () => {
          throw new Error("target-throw");
        },
      ],
    });

    expect(() =>
      throwRun.impulse({ addFlags: ["a"], onError: "throw" } as Record<
        string,
        unknown
      >),
    ).toThrow("listener-throw");
  });
});
