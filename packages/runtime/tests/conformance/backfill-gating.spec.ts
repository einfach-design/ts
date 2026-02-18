import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

describe("conformance/backfill-gating", () => {
  it("uses backfill gate isolation so opposite attempt can deploy", () => {
    const run = createRuntime();
    const calls: Array<{ q: "backfill" | "registered"; gate?: string }> = [];

    run.add({
      id: "expr:flags-only",
      signal: "sig:need",
      flags: { must: true },
      required: { flags: { changed: 0 } },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [
        (i) => {
          calls.push({
            q: i.q,
            ...(i.expression.actBackfillGate !== undefined
              ? { gate: i.expression.actBackfillGate }
              : {}),
          });
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:flags-only"],
      map: { "expr:flags-only": true },
    };

    run.set({ ...snapshot, flags: createFlagsView(["must"]) });
    run.impulse({ addFlags: ["tick"] });

    const backfillCalls = calls.filter((x) => x.q === "backfill");
    expect(backfillCalls.length).toBeGreaterThan(0);
    expect(backfillCalls[0]?.gate).toBe("flags");

    const after = (
      run.get("registeredById") as Map<
        string,
        {
          backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
        }
      >
    ).get("expr:flags-only");

    expect(after?.backfill?.signal?.debt).toBe(1);
    expect(after?.backfill?.flags?.debt).toBe(0);
  });

  it("allows signal-only primary attempt when gate.flags=false", () => {
    const run = createRuntime();
    const calls: Array<{ q: "backfill" | "registered"; gate?: string }> = [];

    run.add({
      id: "expr:signal-primary",
      signal: "sig:ok",
      flags: { must: true },
      required: { flags: { changed: 0 } },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 0 },
      },
      targets: [
        (i) => {
          calls.push({
            q: i.q,
            ...(i.expression.actBackfillGate !== undefined
              ? { gate: i.expression.actBackfillGate }
              : {}),
          });
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;
    snapshot.backfillQ = {
      list: ["expr:signal-primary"],
      map: { "expr:signal-primary": true },
    };

    run.set({ ...snapshot, flags: createFlagsView([]) });
    run.impulse({ signals: ["sig:ok"] });

    const backfillCalls = calls.filter((x) => x.q === "backfill");
    expect(backfillCalls).toEqual([{ q: "backfill", gate: "signal" }]);

    const after = (
      run.get("registeredById") as Map<
        string,
        {
          backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
        }
      >
    ).get("expr:signal-primary");

    expect(after?.backfill?.signal?.debt).toBe(0);
    expect(after?.backfill?.flags?.debt).toBe(0);
  });
});
