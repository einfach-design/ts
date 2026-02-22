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
  describe("outer phase: impulse/canon", () => {
    it("validates report/swallow/throw/fn matrix for invalid input", () => {
      const reportRun = createRuntime();
      const reportDiagnostics: Array<{
        code: string;
        data?: Record<string, unknown>;
      }> = [];

      reportRun.onDiagnostic((diagnostic) => {
        reportDiagnostics.push(diagnostic);
      });

      expect(() =>
        reportRun.impulse({ signals: "bad", onError: "report" } as Record<
          string,
          unknown
        >),
      ).not.toThrow();
      expect(reportDiagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "impulse.input.invalid",
            data: expect.objectContaining({ phase: "impulse/canon" }),
          }),
        ]),
      );

      const swallowRun = createRuntime();
      const swallowDiagnostics: Array<{ code: string }> = [];
      swallowRun.onDiagnostic((diagnostic) => {
        swallowDiagnostics.push(diagnostic);
      });

      expect(() =>
        swallowRun.impulse({ signals: "bad", onError: "swallow" } as Record<
          string,
          unknown
        >),
      ).not.toThrow();
      expect(swallowDiagnostics).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "impulse.input.invalid" }),
        ]),
      );

      const throwRun = createRuntime();
      expect(() =>
        throwRun.impulse({ signals: "bad", onError: "throw" } as Record<
          string,
          unknown
        >),
      ).toThrow("impulse.input.invalid");

      const fnSeen: unknown[] = [];
      const fnRun = createRuntime();
      expect(() =>
        fnRun.impulse({
          signals: "bad",
          onError: (error: unknown) => {
            fnSeen.push(error);
          },
        } as Record<string, unknown>),
      ).not.toThrow();
      expect(fnSeen).toHaveLength(1);
      expect(fnSeen[0]).toBeInstanceOf(Error);

      const fnThrowRun = createRuntime();
      expect(() =>
        fnThrowRun.impulse({
          signals: "bad",
          onError: () => {
            throw new Error("from-onError-fn");
          },
        } as Record<string, unknown>),
      ).toThrow("from-onError-fn");
    });
  });

  it("catches canonicalization getter throws and reports impulse/canon", () => {
    const run = createRuntime();
    const diagnostics: Array<{ code: string; data?: { phase?: string } }> = [];

    run.onDiagnostic((diagnostic) => {
      diagnostics.push(
        diagnostic as { code: string; data?: { phase?: string } },
      );
    });

    const opts = {
      onError: "report",
      get signals() {
        throw new Error("getter-boom");
      },
    };

    expect(() => run.impulse(opts as Record<string, unknown>)).not.toThrow();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "impulse.input.invalid",
          data: expect.objectContaining({ phase: "impulse/canon" }),
        }),
      ]),
    );
  });
  describe("outer phase: impulse/drain", () => {
    it("rejects malformed hydration queue entries before drain processing", () => {
      const run = createRuntime();
      const codes: string[] = [];

      run.onDiagnostic((diagnostic) => {
        codes.push(diagnostic.code);
      });

      const hydration = run.get(undefined, { as: "snapshot" }) as {
        impulseQ: {
          q: {
            entries: Array<Record<string, unknown>>;
            cursor: number;
          };
        };
      } & Record<string, unknown>;

      hydration.impulseQ.q.entries = [
        {
          signals: [],
          removeFlags: [],
          addFlags: null,
        },
      ];
      hydration.impulseQ.q.cursor = 0;

      expect(() => run.set(hydration)).toThrow("set.impulseQ.entryInvalid");
      expect(codes).toContain("set.impulseQ.entryInvalid");
    });
  });

  describe("outer phase: trim/onTrim", () => {
    it("validates report/swallow/throw/fn matrix for trim callback errors", () => {
      const primeRuntime = () => {
        const run = createRuntime();
        run.set({ impulseQ: { config: { retain: true } } });
        run.impulse({ addFlags: ["seed"] });
        return run;
      };

      const reportRun = primeRuntime();
      const reportDiagnostics: Array<{
        code: string;
        data?: Record<string, unknown>;
      }> = [];
      reportRun.onDiagnostic((diagnostic) => {
        reportDiagnostics.push(diagnostic);
      });

      expect(() =>
        reportRun.set({
          impulseQ: {
            config: {
              onError: "report",
              retain: 0,
              onTrim: () => {
                throw new Error("trim-report");
              },
            },
          },
        }),
      ).not.toThrow();
      expect(reportDiagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "runtime.onError.report",
            data: expect.objectContaining({ phase: "trim/onTrim" }),
          }),
        ]),
      );

      const swallowRun = primeRuntime();
      const swallowDiagnostics: Array<{ code: string; data?: unknown }> = [];
      swallowRun.onDiagnostic((diagnostic) => {
        swallowDiagnostics.push(diagnostic);
      });

      expect(() =>
        swallowRun.set({
          impulseQ: {
            config: {
              onError: "swallow",
              retain: 0,
              onTrim: () => {
                throw new Error("trim-swallow");
              },
            },
          },
        }),
      ).not.toThrow();
      expect(swallowDiagnostics).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "runtime.onError.report",
            data: expect.objectContaining({ phase: "trim/onTrim" }),
          }),
        ]),
      );

      const throwRun = primeRuntime();
      expect(() =>
        throwRun.set({
          impulseQ: {
            config: {
              onError: "throw",
              retain: 0,
              onTrim: () => {
                throw new Error("trim-throw");
              },
            },
          },
        }),
      ).toThrow("trim-throw");

      const fnSeen: unknown[] = [];
      const fnRun = primeRuntime();
      expect(() =>
        fnRun.set({
          impulseQ: {
            config: {
              onError: (error: unknown) => {
                fnSeen.push(error);
              },
              retain: 0,
              onTrim: () => {
                throw new Error("trim-fn");
              },
            },
          },
        }),
      ).not.toThrow();
      expect(fnSeen).toHaveLength(1);

      const fnThrowRun = primeRuntime();
      expect(() =>
        fnThrowRun.set({
          impulseQ: {
            config: {
              onError: () => {
                throw new Error("trim-fn-throw-through");
              },
              retain: 0,
              onTrim: () => {
                throw new Error("trim-fn-throw-source");
              },
            },
          },
        }),
      ).toThrow("trim-fn-throw-through");
    });
  });

  describe("outer phase: diagnostic/listener", () => {
    it("validates report/swallow/throw/fn matrix for listener failures", () => {
      const setupWithThrowingListener = () => {
        const run = createRuntime();
        run.onDiagnostic((diagnostic) => {
          if (diagnostic.code === "get.key.invalid") {
            throw new Error("listener-boom");
          }
        });
        return run;
      };

      const reportRun = setupWithThrowingListener();
      reportRun.set({ impulseQ: { config: { onError: "report" } } });
      const reportDiagnostics: Array<{
        code: string;
        data?: Record<string, unknown>;
      }> = [];
      reportRun.onDiagnostic((diagnostic) => {
        reportDiagnostics.push(diagnostic);
      });
      expect(() => reportRun.get("definitely.invalid.key")).toThrow(
        "get.key.invalid",
      );
      expect(reportDiagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "runtime.onError.report",
            data: expect.objectContaining({ phase: "diagnostic/listener" }),
          }),
        ]),
      );

      const swallowRun = setupWithThrowingListener();
      swallowRun.set({ impulseQ: { config: { onError: "swallow" } } });
      const swallowDiagnostics: Array<{ code: string; data?: unknown }> = [];
      swallowRun.onDiagnostic((diagnostic) => {
        swallowDiagnostics.push(diagnostic);
      });
      expect(() => swallowRun.get("definitely.invalid.key")).toThrow(
        "get.key.invalid",
      );
      expect(swallowDiagnostics).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "runtime.onError.report",
            data: expect.objectContaining({ phase: "diagnostic/listener" }),
          }),
        ]),
      );

      const throwRun = setupWithThrowingListener();
      throwRun.set({ impulseQ: { config: { onError: "throw" } } });
      expect(() => throwRun.get("definitely.invalid.key")).toThrow(
        "listener-boom",
      );

      const fnSeen: unknown[] = [];
      const fnRun = setupWithThrowingListener();
      fnRun.set({
        impulseQ: {
          config: {
            onError: (error: unknown) => {
              fnSeen.push(error);
            },
          },
        },
      });
      expect(() => fnRun.get("definitely.invalid.key")).toThrow(
        "get.key.invalid",
      );
      expect(fnSeen).toHaveLength(1);

      const fnThrowRun = setupWithThrowingListener();
      fnThrowRun.set({
        impulseQ: {
          config: {
            onError: () => {
              throw new Error("listener-fn-throw-through");
            },
          },
        },
      });
      expect(() => fnThrowRun.get("definitely.invalid.key")).toThrow(
        "listener-fn-throw-through",
      );
    });
  });

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

    expect(impulseQ.q.cursor).toBe(1);
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
    expect(reportCodes).not.toContain("runtime.target.error");

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

    expect(() => throwRun.impulse({ signals: ["foo"] })).not.toThrow();
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

  it("reports runs.max.exceeded exactly once and blocks further deployments", () => {
    const run = createRuntime();
    const diagnostics: string[] = [];
    const calls: string[] = [];

    run.onDiagnostic((diagnostic) => {
      diagnostics.push(diagnostic.code);
    });

    run.add({
      id: "expr:limit-once",
      runs: { max: 1 },
      targets: [() => calls.push("hit")],
    });

    run.impulse({ addFlags: ["a"] });
    run.impulse({ addFlags: ["b"] });
    run.impulse({ addFlags: ["c"] });

    expect(
      diagnostics.filter((code) => code === "runs.max.exceeded"),
    ).toHaveLength(1);
    expect(calls).toEqual(["hit"]);
  });

  it("defaults add.onError to report and reports target callback failures", () => {
    const run = createRuntime();
    const diagnostics: Array<{ code: string; data?: { phase?: string } }> = [];

    run.onDiagnostic((diagnostic) => {
      diagnostics.push(
        diagnostic as { code: string; data?: { phase?: string } },
      );
    });

    run.add({
      id: "expr:default-onError",
      targets: [
        () => {
          throw new Error("boom");
        },
      ],
    });

    expect(() => run.impulse({ addFlags: ["a"] })).not.toThrow();
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "runtime.target.error",
          data: expect.objectContaining({ phase: "target/callback" }),
        }),
      ]),
    );
  });
});
