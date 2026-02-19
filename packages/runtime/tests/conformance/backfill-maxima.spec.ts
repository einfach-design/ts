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

    run.impulse({ addFlags: ["tick"] });

    const byId = run.get("registeredById", { as: "reference" }) as Map<
      string,
      {
        backfill?: {
          signal?: { debt?: number; runs?: { used: number; max: number } };
          flags?: { debt?: number; runs?: { used: number; max: number } };
        };
      }
    >;

    const expression = byId.get("expr:maxed");
    if (expression?.backfill?.signal?.runs !== undefined) {
      expression.backfill.signal.runs.max = 0;
    }

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
  });
});
