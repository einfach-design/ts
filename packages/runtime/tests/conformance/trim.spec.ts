import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/trim", () => {
  it("trim must preserve runtime domains and scoped projections", () => {
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
    const changedFlagsBefore = run.get("changedFlags", { as: "snapshot" });
    const seenFlagsBefore = run.get("seenFlags", { as: "snapshot" });
    const signalBefore = run.get("signal", { as: "snapshot" });
    const seenSignalsBefore = run.get("seenSignals", { as: "snapshot" });
    const backfillBefore = run.get("backfillQ", { as: "snapshot" });
    const registryQBefore = run.get("registeredQ", { as: "snapshot" });
    const registryByIdBefore = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    const registryByIdBeforeEntries = [...registryByIdBefore.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    );

    const scopedKeys = [
      "flags",
      "changedFlags",
      "seenFlags",
      "signal",
      "seenSignals",
    ] as const;
    const scopeSnapshotsBefore = {
      applied: Object.fromEntries(
        scopedKeys.map((key) => [
          key,
          run.get(key, { scope: "applied", as: "snapshot" }),
        ]),
      ),
      pending: Object.fromEntries(
        scopedKeys.map((key) => [
          key,
          run.get(key, { scope: "pending", as: "snapshot" }),
        ]),
      ),
      pendingOnly: Object.fromEntries(
        scopedKeys.map((key) => [
          key,
          run.get(key, { scope: "pendingOnly", as: "snapshot" }),
        ]),
      ),
    };
    const scopeProjectionBaselineBefore = run.get("scopeProjectionBaseline", {
      as: "snapshot",
    });

    run.set({
      impulseQ: {
        config: {
          retain: 1,
          maxBytes: 0,
        },
      },
    });

    expect(run.get("flags", { as: "snapshot" })).toEqual(flagsBefore);
    expect(run.get("changedFlags", { as: "snapshot" })).toEqual(
      changedFlagsBefore,
    );
    expect(run.get("seenFlags", { as: "snapshot" })).toEqual(seenFlagsBefore);
    expect(run.get("signal", { as: "snapshot" })).toEqual(signalBefore);
    expect(run.get("seenSignals", { as: "snapshot" })).toEqual(
      seenSignalsBefore,
    );
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual(backfillBefore);
    expect(run.get("registeredQ", { as: "snapshot" })).toEqual(registryQBefore);

    const registryByIdAfter = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    const registryByIdAfterEntries = [...registryByIdAfter.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    );
    expect(registryByIdAfterEntries).toEqual(registryByIdBeforeEntries);

    for (const scope of ["applied", "pending", "pendingOnly"] as const) {
      const after = Object.fromEntries(
        scopedKeys.map((key) => [key, run.get(key, { scope, as: "snapshot" })]),
      );
      expect(after).toEqual(scopeSnapshotsBefore[scope]);
    }

    expect(run.get("scopeProjectionBaseline", { as: "snapshot" })).toEqual({
      flags: run.get("flags", { as: "snapshot" }),
      changedFlags: run.get("changedFlags", { as: "snapshot" }),
      seenFlags: run.get("seenFlags", { as: "snapshot" }),
      signal: run.get("signal", { as: "snapshot" }),
      seenSignals: run.get("seenSignals", { as: "snapshot" }),
    });

    expect(scopeProjectionBaselineBefore).not.toEqual(
      run.get("scopeProjectionBaseline", { as: "snapshot" }),
    );
  });
});
