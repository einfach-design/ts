import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/backfill-pending", () => {
  it("pending equals debt>0 and re-enqueues expression exactly once", () => {
    const run = createRuntime();
    const expressionId = "expr:pending-def";

    run.add({
      id: expressionId,
      signal: "sig:need",
      flags: { "flag:required": true },
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
      list: [expressionId],
      map: { [expressionId]: true },
    };

    run.set(snapshot);
    run.impulse({ signals: ["sig:need"] });

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).toContain(expressionId);
    expect(backfillQ.map[expressionId]).toBe(true);
    expect(backfillQ.list.filter((id) => id === expressionId)).toHaveLength(1);
    expect(Object.keys(backfillQ.map)).toEqual([expressionId]);
    expect(new Set(backfillQ.list)).toEqual(
      new Set(Object.keys(backfillQ.map)),
    );

    const registeredById = run.get("registeredById") as Map<
      string,
      {
        backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
      }
    >;
    expect(registeredById.get(expressionId)?.backfill?.signal?.debt).toBe(0);
    expect(registeredById.get(expressionId)?.backfill?.flags?.debt).toBe(1);
  });

  it("remove + re-add with same id must not be blocked by stale backfillQ markers", () => {
    const run = createRuntime();
    const expressionId = "expr:id-reuse";

    const removeFirst = run.add({
      id: expressionId,
      signal: "sig:need",
      flags: { "flag:required": true },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [() => {}],
    });

    run.impulse({ signals: ["sig:need"] });

    const beforeRemove = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    expect(beforeRemove.list).toContain(expressionId);
    expect(beforeRemove.map[expressionId]).toBe(true);

    removeFirst();

    const afterRemove = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    expect(afterRemove.list).not.toContain(expressionId);
    expect(afterRemove.map[expressionId]).toBeUndefined();

    run.add({
      id: expressionId,
      signal: "sig:need",
      flags: { "flag:required": true },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [() => {}],
    });

    run.impulse({ signals: ["sig:need"] });

    const afterReAdd = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(afterReAdd.list).toContain(expressionId);
    expect(afterReAdd.map[expressionId]).toBe(true);
    expect(afterReAdd.list.filter((id) => id === expressionId)).toHaveLength(1);
    expect(new Set(afterReAdd.list)).toEqual(
      new Set(Object.keys(afterReAdd.map)),
    );
  });
});
