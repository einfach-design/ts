/**
 * @file packages/runtime/tests/failure-modes/invariants.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Deterministic sequence gates for runtime invariants.
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createTrace } from "../trace.js";

function flagsFrom(value: unknown): string[] {
  if (
    typeof value === "object" &&
    value !== null &&
    "list" in value &&
    Array.isArray((value as { list?: unknown }).list)
  ) {
    return [...(value as { list: string[] }).list].sort();
  }

  return [];
}

describe("failure-modes/invariants", () => {
  it("scope projections stay internally consistent across deterministic queue state", () => {
    const run = createRuntime();

    run.impulse({ signals: ["applied-signal"], addFlags: ["a"] });

    const hydration = run.get("*", { as: "snapshot" }) as {
      impulseQ: {
        q: { entries: Array<Record<string, unknown>>; cursor: number };
      };
    } & Record<string, unknown>;

    hydration.impulseQ.q.entries = [
      {
        signals: ["applied-signal"],
        addFlags: ["a"],
        removeFlags: [],
      },
      {
        signals: ["pending-signal"],
        addFlags: ["b"],
        removeFlags: [],
      },
    ];
    hydration.impulseQ.q.cursor = 1;
    run.set(hydration);

    const appliedFlags = flagsFrom(run.get("flags", { scope: "applied" }));
    const pendingFlags = flagsFrom(run.get("flags", { scope: "pending" }));
    const pendingOnlyFlags = flagsFrom(
      run.get("flags", { scope: "pendingOnly" }),
    );

    expect(appliedFlags).toEqual(["a"]);
    expect(pendingOnlyFlags).toEqual(["b"]);
    expect(pendingFlags).toEqual(["a", "b"]);

    expect(
      (
        run.get("impulseQ", {
          scope: "applied",
        }) as { q: { entries: unknown[]; cursor: number } }
      ).q,
    ).toEqual({ entries: [hydration.impulseQ.q.entries[0]], cursor: 1 });

    expect(
      (
        run.get("impulseQ", {
          scope: "pendingOnly",
        }) as { q: { entries: unknown[]; cursor: number } }
      ).q,
    ).toEqual({ entries: [hydration.impulseQ.q.entries[1]], cursor: 0 });
  });

  it("trim updates baseline while keeping pending projection stable", () => {
    const run = createRuntime();

    run.impulse({ signals: ["applied"], addFlags: ["a"] });

    const hydration = run.get("*", { as: "snapshot" }) as {
      impulseQ: {
        q: { entries: Array<Record<string, unknown>>; cursor: number };
      };
    } & Record<string, unknown>;

    hydration.impulseQ.q.entries = [
      { signals: ["applied"], addFlags: ["a"], removeFlags: [] },
      { signals: ["pending"], addFlags: ["b"], removeFlags: [] },
    ];
    hydration.impulseQ.q.cursor = 1;
    run.set(hydration);

    const pendingBeforeTrim = flagsFrom(run.get("flags", { scope: "pending" }));
    expect(pendingBeforeTrim).toEqual(["a", "b"]);

    run.set({ impulseQ: { config: { retain: 0 } } });

    const pendingAfterTrim = flagsFrom(run.get("flags", { scope: "pending" }));
    const pendingOnlyAfterTrim = flagsFrom(
      run.get("flags", { scope: "pendingOnly" }),
    );
    const appliedAfterTrim = flagsFrom(run.get("flags", { scope: "applied" }));

    expect(pendingAfterTrim).toEqual(pendingBeforeTrim);
    expect(pendingOnlyAfterTrim).toEqual(["b"]);
    expect(appliedAfterTrim).toEqual(["a"]);

    const appliedQueue = run.get("impulseQ", {
      scope: "applied",
    }) as { q: { entries: unknown[]; cursor: number } };
    const pendingQueue = run.get("impulseQ", {
      scope: "pendingOnly",
    }) as { q: { entries: unknown[]; cursor: number } };

    expect(appliedQueue.q.entries).toEqual([]);
    expect(appliedQueue.q.cursor).toBe(0);
    expect(pendingQueue.q.entries).toHaveLength(1);
    expect(pendingQueue.q.cursor).toBe(0);
  });

  it("onError invariants: inner throw aborts; report/swallow differ; outer wrapper does not reinterpret", () => {
    const run = createRuntime();
    const trace = createTrace();

    run.onDiagnostic((diagnostic) => {
      trace.recordDiagnostic(diagnostic);
    });

    run.add({
      id: "expr:report",
      signal: "sig-report",
      onError: "report",
      targets: [
        () => {
          throw new Error("report-fail");
        },
      ],
    });

    run.add({
      id: "expr:swallow",
      signal: "sig-swallow",
      onError: "swallow",
      targets: [
        () => {
          throw new Error("swallow-fail");
        },
      ],
    });

    run.add({
      id: "expr:inner-throw",
      signal: "sig-inner",
      onError: "throw",
      targets: [
        () => {
          throw new Error("inner-abort");
        },
      ],
    });

    expect(() => run.impulse({ signals: ["sig-report"] })).not.toThrow();
    const reportCount = trace.events.filter(
      (event) =>
        event.type === "diagnostic" && event.code === "runtime.target.error",
    ).length;
    expect(reportCount).toBeGreaterThan(0);

    expect(() => run.impulse({ signals: ["sig-swallow"] })).not.toThrow();
    const swallowCount = trace.events.filter(
      (event) =>
        event.type === "diagnostic" && event.code === "runtime.target.error",
    ).length;
    expect(swallowCount).toBe(reportCount);

    expect(() =>
      run.impulse({ signals: ["sig-inner"], onError: "report" }),
    ).toThrow("inner-abort");
    expect(() =>
      run.impulse({ signals: ["sig-inner"], onError: "swallow" }),
    ).toThrow("inner-abort");

    const onErrorReportFromOuter = trace.events.some(
      (event) =>
        event.type === "diagnostic" &&
        event.code === "runtime.onError.report" &&
        event.phase === "impulse/drain",
    );
    expect(onErrorReportFromOuter).toBe(false);
  });

  it("runs.max lifecycle stays exactly-once and blocks further deployments", () => {
    const run = createRuntime();
    const trace = createTrace();

    run.onDiagnostic((diagnostic) => {
      trace.recordDiagnostic(diagnostic);
    });

    let deployments = 0;

    run.add({
      id: "expr:runs-max",
      signal: "go",
      runs: { max: 1 },
      targets: [
        () => {
          deployments += 1;
        },
      ],
    });

    run.impulse({ signals: ["go"] });
    run.impulse({ signals: ["go"] });
    run.impulse({ signals: ["go"] });

    const runsMaxDiagnostics = trace.events.filter(
      (event) =>
        event.type === "diagnostic" && event.code === "runs.max.exceeded",
    );

    expect(deployments).toBe(1);
    expect(runsMaxDiagnostics).toHaveLength(1);

    const registeredById = run.get("registeredById") as Map<string, unknown>;
    expect(registeredById.has("expr:runs-max")).toBe(false);
  });
});
