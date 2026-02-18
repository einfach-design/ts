import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/backfill-maxima", () => {
  it("treats gate max reached as reject without debt shrink or run increment", () => {
    const run = createRuntime();

    run.add({
      id: "expr:maxed",
      signal: "need",
      flags: { "gate-flag": true },
      backfill: {
        signal: { debt: 2, runs: { max: 1 } },
        flags: { debt: 0 },
      },
      targets: [() => {}],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      registeredById: Record<string, unknown>;
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    const expression = snapshot.registeredById["expr:maxed"] as {
      id?: string;
      signal?: string;
      flags?: Record<string, true>;
      backfill?: {
        signal?: { debt?: number; runs?: { used: number; max: number } };
        flags?: { debt?: number; runs?: { used: number; max: number } };
      };
      targets?: unknown[];
    };

    snapshot.registeredById["expr:maxed"] = {
      id: expression?.id ?? "expr:maxed",
      signal: expression?.signal,
      flags: expression?.flags,
      backfill: {
        signal: {
          debt: 2,
          runs: {
            used: 0,
            max: 0,
          },
        },
        flags: {
          debt: 0,
        },
      },
      targets: expression?.targets ?? [],
    };

    snapshot.backfillQ = {
      list: ["expr:maxed"],
      map: { "expr:maxed": true },
    };

    run.set(snapshot);
    run.impulse({ addFlags: ["tick"] });

    const after = (
      run.get("registeredById") as Map<
        string,
        {
          backfill?: {
            signal?: { debt?: number; runs?: { used: number; max: number } };
          };
        }
      >
    ).get("expr:maxed");

    expect(after?.backfill?.signal?.debt).toBe(2);
    expect(after?.backfill?.signal?.runs?.used).toBe(0);
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual({
      list: ["expr:maxed"],
      map: { "expr:maxed": true },
    });
  });
});
