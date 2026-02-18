import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/backfill-run", () => {
  it("reduces debt by exactly one and re-enqueues when debt remains", () => {
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

    expect(expression?.backfill?.signal?.debt).toBe(1);
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual({
      list: ["expr:pending"],
      map: { "expr:pending": true },
    });
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
