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

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0]).toBeInstanceOf(Error);
    expect((seen[0] as Error).message).toBe("listener boom");
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
    expect(reportCodes).toContain("runtime.onError.report");

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

  it("handles onTrim callback errors through runtime onError modes (Spec §4.2, §8.2)", () => {
    const throwRun = createRuntime();
    throwRun.impulse({ addFlags: ["a"] });
    expect(() =>
      throwRun.set({
        impulseQ: {
          config: {
            retain: true,
            onError: "throw",
            maxBytes: 0,
            onTrim: () => {
              throw new Error("trim throw");
            },
          },
        },
      }),
    ).toThrow("trim throw");

    const reportRun = createRuntime();
    const reportCodes: string[] = [];
    reportRun.onDiagnostic((diagnostic) => {
      reportCodes.push(diagnostic.code);
    });
    reportRun.impulse({ addFlags: ["a"] });
    expect(() =>
      reportRun.set({
        impulseQ: {
          config: {
            retain: true,
            onError: "report",
            maxBytes: 0,
            onTrim: () => {
              throw new Error("trim report");
            },
          },
        },
      }),
    ).not.toThrow();
    expect(reportCodes).toContain("runtime.onError.report");

    const swallowRun = createRuntime();
    swallowRun.impulse({ addFlags: ["a"] });
    expect(() =>
      swallowRun.set({
        impulseQ: {
          config: {
            retain: true,
            onError: "swallow",
            maxBytes: 0,
            onTrim: () => {
              throw new Error("trim swallow");
            },
          },
        },
      }),
    ).not.toThrow();
  });

  it("runs deferred maxBytes trim with onTrim callback once runtime stack clears", () => {
    const run = createRuntime();
    const trimReasons: Array<"retain" | "maxBytes"> = [];

    run.set({
      impulseQ: {
        config: {
          retain: true,
          maxBytes: Number.POSITIVE_INFINITY,
          onTrim: (info: { stats: { reason: "retain" | "maxBytes" } }) => {
            trimReasons.push(info.stats.reason);
          },
        },
      },
    });

    run.add({
      id: "expr:deferred-trim",
      targets: [
        () => {
          run.set({ impulseQ: { config: { maxBytes: 0 } } });
        },
      ],
    });

    run.impulse({ addFlags: ["warmup"] });
    run.impulse({ addFlags: ["a"] });

    expect(trimReasons).toContain("maxBytes");
  });
  it("onError=swallow reports runtime.target.error and continues", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    run.set({
      impulseQ: {
        config: {
          onError: "swallow",
        },
      },
    });

    run.add({
      id: "expr:swallow",
      targets: [
        () => {
          throw new Error("target swallow");
        },
      ],
    });

    expect(() => run.impulse({ addFlags: ["a"] })).not.toThrow();
    expect(codes).toContain("runtime.target.error");

    const impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      q: { cursor: number; entries: unknown[] };
    };

    expect(impulseQ.q.cursor).toBe(1);
    expect(impulseQ.q.entries).toHaveLength(1);
  });
});
