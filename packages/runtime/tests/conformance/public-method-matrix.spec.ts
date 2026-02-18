/**
 * @file packages/runtime/tests/conformance/public-method-matrix.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Deterministic matrix tests across all public runtime methods.
 *
 * Spec-Matrix:
 * | Spec | Test |
 * | --- | --- |
 * | §4.1 | get-matrix covers all keys + as/scope projections |
 * | §4.2 / §4.2.1 | set-matrix covers hydration, patch, forbidden payloads |
 * | §4.4 / §8.3.1 | add-matrix covers callback/object targets, signals, runs, backfill |
 * | §2.9 / §7.4 / §8.2 | impulse-matrix covers signal/addFlags/removeFlags/livePayload/useFixedFlags/onError |
 * | §4.3 / §8.2 | onDiagnostic subscribe/remove and listener error routing |
 * | §4.6 | matchExpression defaulting/reference behavior |
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import type { MatchExpressionInput } from "../../src/match/matchExpression.js";
import { createTrace } from "../trace.js";

const getKeys = [
  "defaults",
  "flags",
  "changedFlags",
  "seenFlags",
  "signal",
  "seenSignals",
  "scopeProjectionBaseline",
  "impulseQ",
  "backfillQ",
  "registeredQ",
  "registeredById",
  "diagnostics",
] as const;

describe("conformance/public-method-matrix", () => {
  it("run.get matrix: every key + as/scope paths are deterministic", () => {
    const run = createRuntime();
    run.impulse({ signals: ["s1"], addFlags: ["a"] });

    for (const key of getKeys) {
      expect(run.get(key, { as: "snapshot" })).toBeDefined();
      expect(run.get(key, { as: "reference" })).toBeDefined();
      expect(run.get(key, { as: "snapshot", scope: "applied" })).toBeDefined();
      expect(run.get(key, { as: "snapshot", scope: "pending" })).toBeDefined();
      expect(() =>
        run.get(key, { as: "snapshot", scope: "pendingOnly" }),
      ).not.toThrow();
    }

    expect(() => run.get("__invalid__")).toThrow("get.key.invalid");
  });

  it("run.set matrix: hydration + allowed patch fields + forbidden shapes", () => {
    const run = createRuntime();

    run.set({ defaults: { gate: { signal: { value: false } } } });
    expect(run.get("defaults")).toMatchObject({
      gate: { signal: { value: false } },
    });

    run.set({ addFlags: ["a"], removeFlags: [] });
    expect((run.get("flags") as { list: string[] }).list).toContain("a");

    run.set({ signals: ["x", "y"] });
    expect(run.get("signal")).toBe("y");

    run.set({
      impulseQ: { config: { retain: 1, maxBytes: Number.POSITIVE_INFINITY } },
    });
    expect(
      (run.get("impulseQ") as { config: { retain: number } }).config.retain,
    ).toBe(1);

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const clone = createRuntime();
    clone.set(snapshot);
    expect(clone.get("flags")).toEqual(run.get("flags"));

    expect(() => run.set({ signal: "forbidden" })).toThrow(
      "set.patch.forbidden",
    );
    expect(() =>
      run.set({ flags: { list: "nope", map: {} } as never }),
    ).toThrow("set.patch.flags.invalid");
  });

  it("run.add matrix: callback/object targets + signals plural + runs/backfill + policy", () => {
    const run = createRuntime();
    const trace = createTrace();

    run.onDiagnostic((d) => trace.recordDiagnostic(d));

    run.add({
      id: "expr:callback",
      signals: ["sig-a", "sig-b"],
      required: { flags: { min: 0 } },
      backfill: { signal: { debt: 1, runs: { max: 1 } } },
      runs: { max: 2 },
      targets: [
        (i, a) => {
          const signal = (i as { signal?: string }).signal;
          trace.recordTarget({
            expressionId: (a as { id: string }).id,
            ...(signal !== undefined ? { signal } : {}),
          });
        },
      ],
    });

    run.add({
      id: "expr:object",
      signal: "sig-a",
      target: {
        on: {
          everyRun: () =>
            trace.recordApiEvent({
              event: "remove",
              expressionId: "expr:object",
            }),
          "sig-a": () =>
            trace.recordTarget({
              expressionId: "expr:object",
              signal: "sig-a",
            }),
        },
      },
    });

    run.impulse({ signals: ["sig-a"], addFlags: ["f1"] });

    expect(
      trace.events.some(
        (e) =>
          e.type === "target" && e.expressionId.startsWith("expr:callback"),
      ),
    ).toBe(true);
    expect(
      trace.events.some(
        (e) => e.type === "target" && e.expressionId === "expr:object",
      ),
    ).toBe(true);

    expect(() => run.add({ id: "expr:no-target" })).toThrow(
      "add.target.required",
    );

    run.add({
      id: "expr:onerror-swallow",
      onError: "swallow",
      targets: [
        () => {
          throw new Error("boom");
        },
      ],
    });
    expect(() => run.impulse({ addFlags: ["policy"] })).not.toThrow();
  });

  it("run.impulse matrix: signal/add/remove/payload/useFixedFlags + onError policy", () => {
    const run = createRuntime();
    const payload = { ok: true };
    const seen: Array<{ signal?: string; payload?: unknown }> = [];

    run.add({
      id: "expr:impulse",
      targets: [
        (i) => {
          const occurrence = i as { signal?: string; payload?: unknown };
          seen.push({
            ...(occurrence.signal !== undefined
              ? { signal: occurrence.signal }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(occurrence, "payload")
              ? { payload: occurrence.payload }
              : {}),
          });
        },
      ],
    });

    run.impulse({
      signals: ["one", "two"],
      addFlags: ["f1"],
      removeFlags: ["missing"],
      livePayload: payload,
      useFixedFlags: { list: ["fx"], map: { fx: true } },
    });

    expect(seen.map((x) => x.signal)).toEqual(["one", "two"]);
    expect(seen.every((x) => x.payload === payload)).toBe(true);

    const removeThrowing = run.add({
      id: "expr:policy-throw",
      onError: "throw",
      targets: [
        () => {
          throw new Error("policy-throw");
        },
      ],
    });
    expect(() => run.impulse({ addFlags: ["x"], onError: "throw" })).toThrow(
      "policy-throw",
    );
    removeThrowing();

    let fnCalls = 0;
    run.add({
      id: "expr:policy-fn",
      onError: () => {
        fnCalls += 1;
      },
      targets: [
        () => {
          throw new Error("policy-fn");
        },
      ],
    });
    expect(() =>
      run.impulse({ addFlags: ["y"], onError: "swallow" }),
    ).not.toThrow();
    expect(fnCalls).toBeGreaterThan(0);

    expect(() => run.impulse({ signals: "bad" } as never)).not.toThrow();
    const diagnostics = run.get("diagnostics") as Array<{ code: string }>;
    expect(diagnostics.some((x) => x.code === "impulse.input.invalid")).toBe(
      true,
    );
  });

  it("run.onDiagnostic matrix: subscribe/remove + listener error routing", () => {
    const run = createRuntime();
    const seen: string[] = [];

    const remove = run.onDiagnostic((d) => {
      seen.push(d.code);
    });

    run.onDiagnostic(function brokenListener() {
      throw new Error("listener failed");
    });

    run.impulse({ signals: "bad" } as never);
    remove();
    run.impulse({ signals: "bad" } as never);

    expect(seen).toContain("impulse.input.invalid");
    expect(seen).toContain("runtime.diagnostic.listenerError");
  });

  it("run.matchExpression matrix: runtime defaults and explicit reference rules", () => {
    const run = createRuntime();
    run.impulse({ signals: ["live-signal"], addFlags: ["f1"] });

    expect(
      run.matchExpression({
        expression: { signal: "live-signal" },
        defaults: { gate: { signal: { value: true }, flags: { value: true } } },
      } as MatchExpressionInput),
    ).toBe(true);

    expect(
      run.matchExpression({
        expression: { signal: "default-signal" },
        defaults: { gate: { signal: { value: true }, flags: { value: true } } },
        reference: {},
      } as MatchExpressionInput),
    ).toBe(false);

    expect(
      run.matchExpression({
        expression: { flags: [{ flag: "f1", value: true }] },
        defaults: { gate: { signal: { value: true }, flags: { value: true } } },
      } as MatchExpressionInput),
    ).toBe(true);
  });
});
