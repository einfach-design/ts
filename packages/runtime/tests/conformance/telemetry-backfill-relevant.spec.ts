import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

describe("conformance/telemetry-backfill-relevant", () => {
  it("initializes and updates backfill telemetry only for backfill-relevant expressions", () => {
    const run = createRuntime();
    const calls: Array<{
      q: "backfill" | "registered";
      signalRuns?: number;
      flagsRuns?: number;
      runs?: number;
      inBackfillQ: boolean;
    }> = [];

    run.add({
      id: "expr:telemetry",
      signal: "never",
      flags: { "flag:need": true },
      required: { flags: { changed: 0 } },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [
        (i) => {
          calls.push({
            q: i.q,
            ...(i.expression.backfillSignalRuns !== undefined
              ? { signalRuns: i.expression.backfillSignalRuns }
              : {}),
            ...(i.expression.backfillFlagsRuns !== undefined
              ? { flagsRuns: i.expression.backfillFlagsRuns }
              : {}),
            ...(i.expression.backfillRuns !== undefined
              ? { runs: i.expression.backfillRuns }
              : {}),
            inBackfillQ: i.expression.inBackfillQ,
          });
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:telemetry"],
      map: { "expr:telemetry": true },
    };

    run.set({ ...snapshot, flags: createFlagsView(["flag:need"]) });
    run.impulse({ addFlags: ["tick"] });

    const backfillCall = calls.find((x) => x.q === "backfill");
    expect(backfillCall).toEqual(
      expect.objectContaining({
        signalRuns: 0,
        flagsRuns: 0,
        runs: 0,
        inBackfillQ: false,
      }),
    );
  });
});
