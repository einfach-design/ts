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

    const list: string[] = Array.isArray(listValue)
      ? (listValue as string[])
      : [];
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
            i: (i && typeof i === "object"
              ? (i as Record<string, unknown>)
              : {}) as Record<string, unknown>,
            a: (a && typeof a === "object"
              ? (a as Record<string, unknown>)
              : {}) as Record<string, unknown>,
            r: (r && typeof r === "object"
              ? (r as Record<string, unknown>)
              : {}) as Record<string, unknown>,
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

  it("E2 — runs per occurrence carry signal/payload and flag deltas", () => {
    const run = createRuntime();

    run.set({ addFlags: ["existing"] } as Record<string, unknown>);

    const payload = { event: "go" };
    const calls: Array<Record<string, unknown>> = [];

    run.add({
      id: "expr:e2",
      targets: [
        (i: unknown) => {
          calls.push((i ?? {}) as Record<string, unknown>);
        },
      ],
    });

    run.impulse({
      signals: ["s1", "s2"],
      addFlags: ["new"],
      removeFlags: ["existing"],
      livePayload: payload,
    } as Record<string, unknown>);

    expect(calls).toHaveLength(2);
    expect(calls.map((entry) => entry.signal)).toEqual(["s1", "s2"]);

    for (const call of calls) {
      expect(call.payload).toEqual(payload);
      expect(call.addFlags).toEqual(["new"]);
      expect(call.removeFlags).toEqual(["existing"]);

      const changed = call.changedFlags as
        | { list?: readonly string[] }
        | undefined;
      expect(changed?.list).toEqual(["existing", "new"]);
    }
  });

  it("E3 — runs.max limits deployments and deregisters expression after first deploy (Spec §4.4, §7.4)", () => {
    const run = createRuntime();
    const expressionId = "expr:runs-max-1";
    const calls: string[] = [];

    run.add({
      id: expressionId,
      runs: { max: 1 },
      targets: [() => calls.push("hit")],
    });

    run.impulse({ addFlags: ["a"] });

    const registeredByIdAfterFirstDeploy = run.get("registeredById") as Map<
      string,
      unknown
    >;
    expect(registeredByIdAfterFirstDeploy.has(expressionId)).toBe(false);

    run.impulse({ addFlags: ["b"] });

    // Spec §7.4: once used >= max, expression must not deploy again.
    expect(calls).toEqual(["hit"]);

    const registeredByIdAfterSecondImpulse = run.get("registeredById") as Map<
      string,
      unknown
    >;
    expect(registeredByIdAfterSecondImpulse.has(expressionId)).toBe(false);

    const registeredQ = run.get("registeredQ") as Array<{
      id: string;
      tombstone?: true;
    }>;
    expect(registeredQ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expressionId, tombstone: true }),
      ]),
    );
  });

  it("E4 — runs.max values <= 0 are clamped to 1 (Spec §4.4)", () => {
    const run = createRuntime();
    const calls: string[] = [];

    run.add({
      id: "expr:runs-max-clamp",
      runs: { max: 0 },
      targets: [() => calls.push("hit")],
    });

    run.impulse({ addFlags: ["a"] });
    run.impulse({ addFlags: ["b"] });

    // Spec §4.4: canonicalization of add opts must keep runs.max runtime-safe.
    expect(calls).toEqual(["hit"]);
  });

  it("E4.1 — required.flags numbers are canonicalized to non-negative integers", () => {
    const run = createRuntime();

    run.add({
      id: "expr:required-canonical",
      required: { flags: { min: 1.9, max: -3.4, changed: 2.2 } },
      targets: [() => undefined],
    });

    const registeredById = run.get("registeredById") as Map<
      string,
      {
        required?: { flags?: { min?: number; max?: number; changed?: number } };
      }
    >;
    const expression = registeredById.get("expr:required-canonical");

    expect(expression?.required?.flags).toEqual({ min: 1, max: 0, changed: 2 });
  });

  it("E4.2 — empty required payload does not persist on registered expression", () => {
    const run = createRuntime();

    run.add({
      id: "expr:required-empty",
      required: { flags: {} },
      targets: [() => undefined],
    });

    const registeredById = run.get("registeredById") as Map<
      string,
      { required?: unknown }
    >;

    expect(registeredById.get("expr:required-empty")?.required).toBeUndefined();
  });
  it("E5 — default runs.max stays unbounded for repeated matches (Spec §2.11.3, §4.4)", () => {
    const run = createRuntime();
    const calls: string[] = [];

    run.add({
      id: "expr:runs-max-default",
      targets: [() => calls.push("hit")],
    });

    run.impulse({ addFlags: ["a"] });
    run.impulse({ addFlags: ["b"] });
    run.impulse({ addFlags: ["c"] });

    // Spec §2.11.3: runs counters exist, but default max must not prematurely cap execution.
    expect(calls).toHaveLength(3);
  });

  it("run.onDiagnostic subscribes to future diagnostics and remove deregisters", () => {
    const run = createRuntime();
    const seen: string[] = [];

    const remove = run.onDiagnostic((diagnostic) => {
      seen.push(diagnostic.code);
    });

    run.impulse({ signals: "bad" } as Record<string, unknown>);
    remove();
    run.impulse({ signals: "bad" } as Record<string, unknown>);

    expect(seen).toEqual(["impulse.input.invalid"]);
  });

  it("expression.onError modes: report and swallow do not throw", () => {
    const run = createRuntime();
    const seen: string[] = [];

    run.onDiagnostic((diagnostic) => {
      seen.push(diagnostic.code);
    });

    run.add({
      id: "expr:error",
      onError: "report",
      targets: [
        () => {
          throw new Error("boom");
        },
      ],
    });

    run.impulse({ addFlags: ["x"] });

    expect(seen).toContain("runtime.target.error");

    const runSwallow = createRuntime();
    runSwallow.add({
      id: "expr:error:swallow",
      onError: "swallow",
      targets: [
        () => {
          throw new Error("boom");
        },
      ],
    });

    expect(() => runSwallow.impulse({ addFlags: ["y"] })).not.toThrow();
  });

  it("diagnostic listener errors do not stop later listeners and runtime remains usable", () => {
    const run = createRuntime();
    let secondListenerCalls = 0;

    run.onDiagnostic(() => {
      throw new Error("listener boom");
    });

    run.onDiagnostic(() => {
      secondListenerCalls += 1;
    });

    expect(() =>
      run.impulse({ signals: "bad" } as Record<string, unknown>),
    ).not.toThrow();

    expect(secondListenerCalls).toBeGreaterThan(0);

    expect(() =>
      run.impulse({ signals: "bad" } as Record<string, unknown>),
    ).not.toThrow();
    expect(secondListenerCalls).toBeGreaterThan(1);
  });

  it("diagnostic listener errors are reported with stable code and listener metadata", () => {
    const run = createRuntime();
    const seen: Array<{ code: string; data?: Record<string, unknown> }> = [];

    run.onDiagnostic((diagnostic) => {
      seen.push({
        code: diagnostic.code,
        ...(diagnostic.data !== undefined ? { data: diagnostic.data } : {}),
      });
    });

    run.onDiagnostic(function brokenListener() {
      throw new Error("listener failed");
    });

    run.impulse({ signals: "bad" } as Record<string, unknown>);

    const listenerError = seen.find(
      (diagnostic) => diagnostic.code === "runtime.diagnostic.listenerError",
    );

    expect(listenerError).toBeTruthy();
    expect(listenerError?.data?.phase).toBe("diagnostic/listener");
    expect(listenerError?.data?.listenerIndex).toBeTypeOf("number");
    expect(listenerError?.data?.handlerName).toBe("brokenListener");
  });

  it("E8 — runs.used increments only when at least one target is attempted", () => {
    const run = createRuntime();

    run.add({
      id: "expr:no-attempt",
      runs: { max: 2 },
      onError: "swallow",
      targets: [{ on: {} }],
    });

    run.impulse({ signals: ["s1"] });
    run.impulse({ signals: ["s2"] });

    const expression = (
      run.get("registeredById") as Map<string, { runs?: { used: number } }>
    ).get("expr:no-attempt");
    expect(expression?.runs?.used).toBe(0);
  });

  it("E9 — reaching runs.max emits runs.max.exceeded diagnostic", () => {
    const run = createRuntime();
    const seen: Array<{
      code: string;
      severity?: string;
      data?: Record<string, unknown>;
    }> = [];

    run.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "runs.max.exceeded") {
        seen.push(diagnostic);
      }
    });

    run.add({
      id: "expr:budget",
      runs: { max: 1 },
      targets: [() => {}],
    });

    run.impulse({ addFlags: ["a"] });

    expect(seen).toEqual([
      expect.objectContaining({
        code: "runs.max.exceeded",
        severity: "warn",
        data: expect.objectContaining({ expressionId: "expr:budget", max: 1 }),
      }),
    ]);
  });

  it("run.add retroactive=true performs onboarding validation run", () => {
    const run = createRuntime();
    const retroTrue: string[] = [];
    const retroFalse: string[] = [];

    run.impulse({ signals: ["ready"], addFlags: ["on"] });

    run.add({
      id: "expr:retro:true",
      signal: "ready",
      flags: { on: true },
      required: { flags: { changed: 0 } },
      retroactive: true,
      targets: [() => retroTrue.push("hit")],
    });

    run.add({
      id: "expr:retro:false",
      signal: "ready",
      flags: { on: true },
      required: { flags: { changed: 0 } },
      retroactive: false,
      targets: [() => retroFalse.push("hit")],
    });

    expect(retroTrue).toEqual(["hit"]);
    expect(retroFalse).toEqual([]);
  });

  it("trim byte measurement must not throw for unserializable payloads", () => {
    const run = createRuntime();

    run.impulse({ livePayload: 1n as unknown as number, addFlags: ["a"] });

    expect(() =>
      run.set({ impulseQ: { config: { maxBytes: 1 } } }),
    ).not.toThrow();
  });
});
