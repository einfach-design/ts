import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";
import { coreRun, type RegisteredExpression } from "../../src/runs/coreRun.js";

describe("conformance/applied-expression", () => {
  it("remove() removes expression deterministically and prevents future occurrences", () => {
    const run = createRuntime();
    const expressionId = "expr:applied-remove";
    let calls = 0;

    run.add({
      id: expressionId,
      targets: [
        (_i, a) => {
          calls += 1;
          a.remove();
        },
      ],
    });

    run.impulse({ addFlags: ["tick:1"] });
    run.impulse({ addFlags: ["tick:2"] });

    expect(calls).toBe(1);

    const registeredById = run.get("registeredById") as Map<string, unknown>;
    expect(registeredById.has(expressionId)).toBe(false);
  });

  it("matchFlags(input) always matches against runtime flags, not actExpression.flags", () => {
    const run = createRuntime();
    const matchResults: boolean[] = [];

    run.add({
      id: "expr:applied-match-flags",
      targets: [
        (_i, a) => {
          matchResults.push(a.matchFlags("flag:truth"));
          matchResults.push(a.matchFlags({ "flag:fixed": true }));
        },
      ],
    });

    run.impulse({
      useFixedFlags: createFlagsView(["flag:fixed"]),
      addFlags: ["flag:truth"],
    });

    run.impulse({
      useFixedFlags: createFlagsView([]),
      addFlags: ["flag:other"],
    });

    expect(matchResults).toEqual([true, false, true, false]);
  });

  it("applExpression.payload kommt aus AddOpts.payload", () => {
    const run = createRuntime();

    run.add({
      payload: { k: 1 },
      targets: [
        (i: unknown, a: unknown) => {
          expect(a).toHaveProperty("payload");
          expect((a as { payload?: unknown }).payload).toEqual({ k: 1 });
          expect("payload" in (i as Record<string, unknown>)).toBe(false);
        },
      ],
    } as unknown as Record<string, unknown>);

    run.impulse({ addFlags: ["x"] });
  });

  it("beide payloads koexistieren", () => {
    const run = createRuntime();

    run.add({
      payload: "exprPayload",
      targets: [
        (i: unknown, a: unknown) => {
          expect((a as { payload?: unknown }).payload).toBe("exprPayload");
          expect((i as { payload?: unknown }).payload).toBe("impulsePayload");
        },
      ],
    } as unknown as Record<string, unknown>);

    run.impulse({ livePayload: "impulsePayload" });
  });
  it("appliedExpression.flags ist isoliert (Mutation darf Matching nicht verändern)", () => {
    let captured: string[] | undefined;
    let calls = 0;

    const expression: RegisteredExpression = {
      id: "expr:flags-isolation",
      flags: ["a"],
      targets: [
        (_i, a) => {
          calls += 1;
          captured = (a as { flags?: string[] }).flags;
        },
      ],
    };

    const runCore = () =>
      coreRun({
        expression,
        store: {
          flagsTruth: createFlagsView(["a"]),
          referenceFlags: createFlagsView(["a"]),
          changedFlags: createFlagsView(["a"]),
          addFlags: ["a"],
          removeFlags: [],
          occurrenceHasPayload: false,
          occurrenceSeq: 1,
          occurrenceId: "occ:1",
          defaults: {},
          expressionTelemetryById: new Map(),
        },
        toMatchFlagsView: (v) =>
          v === undefined
            ? undefined
            : { map: { ...v.map }, list: [...v.list] },
        createFlagsView,
        matchExpression: ({ expression: input }) => {
          const specs = input.flags as
            | Array<{ flag?: string } | string>
            | undefined;
          const first = specs?.[0];
          if (typeof first === "string") {
            return first === "a";
          }
          return first?.flag === "a";
        },
        dispatch: (x) => {
          const { target, args } = x as {
            target: unknown;
            args: [unknown, unknown, unknown];
          };

          if (typeof target === "function") {
            target(...args);
            return { attempted: 1 };
          }
          return { attempted: 0 };
        },
        gate: { signal: true, flags: true },
        runtimeCore: {
          get: () => undefined,
          matchExpression: () => undefined,
          remove: () => undefined,
        },
      });

    runCore();
    expect(calls).toBe(1);
    expect(captured).toBeDefined();

    try {
      captured!.splice(0, captured!.length, "b");
    } catch {
      // no-op: mutation must not affect runtime matching
    }

    runCore();

    expect(calls).toBe(2);
  });
});
