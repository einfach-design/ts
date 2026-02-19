/**
 * @file packages/runtime/tests/conformance/public-contract.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 */

import { describe, expect, it } from "vitest";

describe("conformance: public contract (values)", () => {
  it("exports createRuntime from the public entry", async () => {
    const mod = await import("../../src/index.js");
    expect(typeof mod.createRuntime).toBe("function");
  });

  it("createRuntime() returns the wired runtime API", async () => {
    const { createRuntime } = await import("../../src/index.js");
    const run = createRuntime();

    expect(typeof run.add).toBe("function");
    expect(typeof run.impulse).toBe("function");
    expect(typeof run.get).toBe("function");
    expect(typeof run.set).toBe("function");
    expect(typeof run.matchExpression).toBe("function");
    expect(typeof run.onDiagnostic).toBe("function");
  });

  it("run.add returns a remove function", async () => {
    const { createRuntime } = await import("../../src/index.js");
    const run = createRuntime();

    const remove = run.add({
      id: "expr:contract",
      targets: [() => undefined],
    });

    expect(typeof remove).toBe("function");
  });

  it("target receives appliedExpression with remove() that removes expression immediately", async () => {
    const { createRuntime } = await import("../../src/index.js");
    const run = createRuntime();

    const calls: string[] = [];

    run.add({
      id: "expr:remove-via-applied",
      backfill: { signal: { debt: 1 } },
      targets: [
        (_i, appliedExpression) => {
          calls.push("first");
          (appliedExpression as { remove: () => void }).remove();
        },
        () => {
          calls.push("second");
        },
      ],
    });

    run.impulse({ addFlags: ["tick:1"] });

    const registeredById = run.get("registeredById") as Map<string, unknown>;
    expect(registeredById.has("expr:remove-via-applied")).toBe(false);

    expect(calls).toEqual(["first"]);

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    expect(backfillQ.list).not.toContain("expr:remove-via-applied");
    expect(backfillQ.map["expr:remove-via-applied"]).toBeUndefined();

    run.impulse({ addFlags: ["tick:2"] });
    expect(calls).toEqual(["first"]);
  });

  it("target receives appliedExpression.matchFlags(...) bound to runtime flags matching", async () => {
    const { createRuntime } = await import("../../src/index.js");
    const run = createRuntime();

    const matchResults: boolean[] = [];

    run.add({
      id: "expr:match-flags-applied",
      targets: [
        (_i, appliedExpression) => {
          const a = appliedExpression as {
            matchFlags: (input: unknown) => boolean;
          };
          matchResults.push(a.matchFlags("flag:on"));
          matchResults.push(a.matchFlags({ "flag:off": false }));
          matchResults.push(a.matchFlags({ "flag:missing": true }));
        },
      ],
    });

    run.impulse({ addFlags: ["flag:on"] });

    expect(matchResults).toEqual([true, true, false]);
  });

  it("remove + re-add with same id is not blocked by stale backfillQ markers", async () => {
    const { createRuntime } = await import("../../src/index.js");
    const run = createRuntime();

    const remove = run.add({
      id: "expr:reuse",
      signal: "sig:reuse",
      flags: { "flag:required": true },
      backfill: { signal: { debt: 1 }, flags: { debt: 1 } },
      targets: [() => undefined],
    });

    const beforeRemove = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    expect(beforeRemove.map["expr:reuse"]).toBe(true);

    remove();

    run.add({
      id: "expr:reuse",
      signal: "sig:reuse",
      flags: { "flag:required": true },
      backfill: { signal: { debt: 1 }, flags: { debt: 1 } },
      targets: [() => undefined],
    });

    run.impulse({ signals: ["sig:reuse"] });

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.map["expr:reuse"]).toBe(true);
    expect(backfillQ.list.filter((id) => id === "expr:reuse")).toHaveLength(1);
  });
});
