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

    const snapshot = run.get("*", { as: "snapshot" }) as unknown as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: [expressionId],
      map: { [expressionId]: true },
    };

    (run.set as (patch: Record<string, unknown>) => void)(snapshot);
    run.impulse({ signals: ["sig:need"] });

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as unknown as {
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

    const registeredById = run.get("registeredById") as unknown as Map<
      string,
      {
        backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
      }
    >;
    expect(registeredById.get(expressionId)?.backfill?.signal?.debt).toBe(0);
    expect(registeredById.get(expressionId)?.backfill?.flags?.debt).toBe(1);
  });

  it("remove must clear backfillQ markers; re-add with same id must throw; adding a new id must work", () => {
    const run = createRuntime();
    const firstId = "expr:id-reuse:first";
    const secondId = "expr:id-reuse:second";

    const removeFirst = run.add({
      id: firstId,
      signal: "sig:need",
      flags: { "flag:required": true },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [() => {}],
    });

    const beforeRemove = run.get("backfillQ", {
      as: "snapshot",
    }) as unknown as {
      list: string[];
      map: Record<string, true>;
    };
    expect(beforeRemove.map[firstId]).toBe(true);

    removeFirst();

    const afterRemove = run.get("backfillQ", { as: "snapshot" }) as unknown as {
      list: string[];
      map: Record<string, true>;
    };
    expect(afterRemove.list).not.toContain(firstId);
    expect(afterRemove.map[firstId]).toBeUndefined();

    expect(() =>
      run.add({
        id: firstId,
        signal: "sig:need",
        flags: { "flag:required": true },
        backfill: {
          signal: { debt: 1 },
          flags: { debt: 1 },
        },
        targets: [() => {}],
      }),
    ).toThrow("Duplicate registered expression id: expr:id-reuse:first");

    run.add({
      id: secondId,
      signal: "sig:need",
      flags: { "flag:required": true },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [() => {}],
    });

    run.impulse({ signals: ["sig:need"] });

    const afterReAdd = run.get("backfillQ", { as: "snapshot" }) as unknown as {
      list: string[];
      map: Record<string, true>;
    };

    expect(afterReAdd.map[firstId]).toBeUndefined();
    expect(afterReAdd.list).toContain(secondId);
    expect(afterReAdd.map[secondId]).toBe(true);
    expect(afterReAdd.list.filter((id) => id === secondId)).toHaveLength(1);
    expect(new Set(afterReAdd.list)).toEqual(
      new Set(Object.keys(afterReAdd.map)),
    );
  });
});
