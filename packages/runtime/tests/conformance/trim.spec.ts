import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/trim", () => {
  it("trim must preserve flagsTruth/backfillQ/registry invariants", () => {
    const run = createRuntime();

    run.add({
      id: "expr:trim-invariant",
      signal: "sig:hit",
      flags: { x: true },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [() => {}],
    });

    run.impulse({ signals: ["sig:hit"] });
    run.impulse({ signals: ["sig:a"], addFlags: ["a"] });
    run.impulse({ signals: ["sig:b"], addFlags: ["b"] });

    const flagsBefore = run.get("flags", { as: "snapshot" });
    const backfillBefore = run.get("backfillQ", { as: "snapshot" });
    const registryQBefore = run.get("registeredQ", { as: "snapshot" });
    const registryByIdBefore = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    const registryByIdBeforeEntries = [...registryByIdBefore.entries()];

    run.set({
      impulseQ: {
        config: {
          retain: 1,
          maxBytes: 0,
        },
      },
    });

    expect(run.get("flags", { as: "snapshot" })).toEqual(flagsBefore);
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual(backfillBefore);
    expect(run.get("registeredQ", { as: "snapshot" })).toEqual(registryQBefore);

    const registryByIdAfter = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    expect([...registryByIdAfter.entries()]).toEqual(registryByIdBeforeEntries);
  });
});
