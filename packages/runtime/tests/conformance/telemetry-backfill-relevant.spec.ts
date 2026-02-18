import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

type TelemetryCall = {
  q: "backfill" | "registered";
  signalRuns?: number;
  flagsRuns?: number;
  runs?: number;
  inBackfillQ: boolean;
};

describe("conformance/telemetry-backfill-relevant", () => {
  it("reports inBackfillQ=false for backfill-relevant expressions when debt drains in same run", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];

    run.add({
      id: "expr:drained",
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 0 },
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
      list: ["expr:drained"],
      map: { "expr:drained": true },
    };

    run.set(snapshot);

    const liveExpression = (
      run.get("registeredQ") as Array<{
        id: string;
        runs?: { used: number; max: number };
      }>
    ).find((expression) => expression.id === "expr:reenqueued");

    if (liveExpression !== undefined) {
      liveExpression.runs = { used: 1, max: 1 };
    }

    run.impulse({ addFlags: ["tick"] });

    const registeredCall = calls.find((call) => call.q === "registered");
    expect(registeredCall).toEqual(
      expect.objectContaining({
        signalRuns: 1,
        flagsRuns: 0,
        runs: 1,
        inBackfillQ: false,
      }),
    );
  });

  it("keeps backfill-relevant telemetry stable across backfill and registered runs", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];

    run.add({
      id: "expr:pending",
      signal: "sig:need",
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
      list: ["expr:pending"],
      map: { "expr:pending": true },
    };

    run.set(snapshot);

    run.impulse({ signals: ["sig:need"] });

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).toContain("expr:pending");
    expect(backfillQ.map["expr:pending"]).toBe(true);
    expect(backfillQ.list.filter((id) => id === "expr:pending").length).toBe(1);

    const backfillCall = calls.find((call) => call.q === "backfill");
    expect(backfillCall).toBeDefined();
    expect(backfillCall).toEqual(
      expect.objectContaining({
        inBackfillQ: false,
      }),
    );

    const registeredCall = calls.find((call) => call.q === "registered");
    expect(registeredCall).toBeDefined();
    expect(registeredCall).toEqual(
      expect.objectContaining({
        inBackfillQ: true,
      }),
    );
  });

  it("keeps non-backfill-relevant telemetry fields absent and inBackfillQ=false", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];

    run.add({
      id: "expr:plain",
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

    run.impulse({ addFlags: ["tick"] });

    expect(calls).toContainEqual({ q: "registered", inBackfillQ: false });
  });
});
