import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/backfill-run", () => {
  it("rotation drains debt within same run", () => {
    const run = createRuntime();

    run.add({
      id: "expr:pending",
      backfill: { signal: { debt: 2 } },
      targets: [() => {}],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:pending"],
      map: { "expr:pending": true },
    };

    run.set(snapshot);
    run.impulse({ addFlags: ["tick"] });

    const expression = (
      run.get("registeredById") as Map<
        string,
        {
          backfill?: { signal?: { debt?: number } };
        }
      >
    ).get("expr:pending");

    expect(expression?.backfill?.signal?.debt).toBe(0);
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual({
      list: [],
      map: {},
    });
  });

  it("re-enqueues when debt remains greater than zero after one gated backfill deployment", () => {
    const run = createRuntime();

    run.add({
      id: "expr:pending-gt-zero",
      signal: "sig:need",
      flags: { must: true },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [() => {}],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:pending-gt-zero"],
      map: { "expr:pending-gt-zero": true },
    };

    run.set(snapshot);
    run.impulse({ signals: ["sig:need"] });

    const expression = (
      run.get("registeredById") as Map<
        string,
        {
          backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
        }
      >
    ).get("expr:pending-gt-zero");

    expect(expression?.backfill?.signal?.debt).toBe(0);
    expect(expression?.backfill?.flags?.debt).toBe(1);
    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ).toEqual({
      list: ["expr:pending-gt-zero"],
      map: { "expr:pending-gt-zero": true },
    });
    expect(
      backfillQ.list.filter((id) => id === "expr:pending-gt-zero"),
    ).toHaveLength(1);
    expect(Object.keys(backfillQ.map)).toEqual(["expr:pending-gt-zero"]);
  });

  it("does not re-enqueue when debt reaches zero", () => {
    const run = createRuntime();

    run.add({
      id: "expr:done",
      backfill: { signal: { debt: 1 } },
      targets: [() => {}],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:done"],
      map: { "expr:done": true },
    };

    run.set(snapshot);
    run.impulse({ addFlags: ["tick"] });

    const expression = (
      run.get("registeredById") as Map<
        string,
        {
          backfill?: { signal?: { debt?: number } };
        }
      >
    ).get("expr:done");

    expect(expression?.backfill?.signal?.debt).toBe(0);
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual({
      list: [],
      map: {},
    });
  });
});
