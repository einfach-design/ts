import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/trim", () => {
  it("trim must preserve queues, registry, scoped projections and baseline invariants", () => {
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

    const backfillBefore = run.get("backfillQ", { as: "snapshot" });
    const registryQBefore = run.get("registeredQ", { as: "snapshot" });
    const registryByIdBefore = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    const registryByIdBeforeEntries = [...registryByIdBefore.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    );

    const appliedBefore = {
      flags: run.get("flags", { scope: "applied", as: "snapshot" }),
      changedFlags: run.get("changedFlags", {
        scope: "applied",
        as: "snapshot",
      }),
      seenFlags: run.get("seenFlags", { scope: "applied", as: "snapshot" }),
      signal: run.get("signal", { scope: "applied", as: "snapshot" }),
      seenSignals: run.get("seenSignals", {
        scope: "applied",
        as: "snapshot",
      }),
    };
    const pendingBefore = {
      flags: run.get("flags", { scope: "pending", as: "snapshot" }),
      changedFlags: run.get("changedFlags", {
        scope: "pending",
        as: "snapshot",
      }),
      seenFlags: run.get("seenFlags", { scope: "pending", as: "snapshot" }),
      signal: run.get("signal", { scope: "pending", as: "snapshot" }),
      seenSignals: run.get("seenSignals", {
        scope: "pending",
        as: "snapshot",
      }),
    };
    const pendingOnlyBefore = {
      flags: run.get("flags", { scope: "pendingOnly", as: "snapshot" }),
      changedFlags: run.get("changedFlags", {
        scope: "pendingOnly",
        as: "snapshot",
      }),
      seenFlags: run.get("seenFlags", {
        scope: "pendingOnly",
        as: "snapshot",
      }),
      signal: run.get("signal", { scope: "pendingOnly", as: "snapshot" }),
      seenSignals: run.get("seenSignals", {
        scope: "pendingOnly",
        as: "snapshot",
      }),
    };

    run.set({
      impulseQ: {
        config: {
          retain: 1,
          maxBytes: 0,
        },
      },
    });

    expect(run.get("backfillQ", { as: "snapshot" })).toEqual(backfillBefore);
    expect(run.get("registeredQ", { as: "snapshot" })).toEqual(registryQBefore);

    const registryByIdAfter = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    expect(
      [...registryByIdAfter.entries()].sort(([l], [r]) => l.localeCompare(r)),
    ).toEqual(registryByIdBeforeEntries);

    expect({
      flags: run.get("flags", { scope: "applied", as: "snapshot" }),
      changedFlags: run.get("changedFlags", {
        scope: "applied",
        as: "snapshot",
      }),
      seenFlags: run.get("seenFlags", { scope: "applied", as: "snapshot" }),
      signal: run.get("signal", { scope: "applied", as: "snapshot" }),
      seenSignals: run.get("seenSignals", {
        scope: "applied",
        as: "snapshot",
      }),
    }).toEqual(appliedBefore);
    expect({
      flags: run.get("flags", { scope: "pending", as: "snapshot" }),
      changedFlags: run.get("changedFlags", {
        scope: "pending",
        as: "snapshot",
      }),
      seenFlags: run.get("seenFlags", { scope: "pending", as: "snapshot" }),
      signal: run.get("signal", { scope: "pending", as: "snapshot" }),
      seenSignals: run.get("seenSignals", {
        scope: "pending",
        as: "snapshot",
      }),
    }).toEqual(pendingBefore);
    expect({
      flags: run.get("flags", { scope: "pendingOnly", as: "snapshot" }),
      changedFlags: run.get("changedFlags", {
        scope: "pendingOnly",
        as: "snapshot",
      }),
      seenFlags: run.get("seenFlags", {
        scope: "pendingOnly",
        as: "snapshot",
      }),
      signal: run.get("signal", { scope: "pendingOnly", as: "snapshot" }),
      seenSignals: run.get("seenSignals", {
        scope: "pendingOnly",
        as: "snapshot",
      }),
    }).toEqual(pendingOnlyBefore);
    const baselineAfter = run.get("scopeProjectionBaseline", {
      as: "snapshot",
    }) as {
      flags: unknown;
      changedFlags: unknown;
      seenFlags: unknown;
      signal: unknown;
      seenSignals: unknown;
    };

    expect(baselineAfter.flags).toEqual(
      run.get("flags", { scope: "applied", as: "snapshot" }),
    );
    expect(baselineAfter.changedFlags).toEqual(
      run.get("changedFlags", { scope: "applied", as: "snapshot" }),
    );
    expect(baselineAfter.seenFlags).toEqual(
      run.get("seenFlags", { scope: "applied", as: "snapshot" }),
    );
    expect(baselineAfter.signal).toEqual(
      run.get("signal", { scope: "applied", as: "snapshot" }),
    );
    expect(baselineAfter.seenSignals).toEqual(
      run.get("seenSignals", { scope: "applied", as: "snapshot" }),
    );
  });
});
