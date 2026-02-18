import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

type TelemetryCall = {
  q: "backfill" | "registered";
  signalRuns?: number;
  flagsRuns?: number;
  runs?: number;
  inBackfillQ: boolean;
};

type TelemetryTargetInput = {
  q: TelemetryCall["q"];
  expression: {
    backfillSignalRuns?: number;
    backfillFlagsRuns?: number;
    backfillRuns?: number;
    inBackfillQ: boolean;
  };
};

const pushCall = (calls: TelemetryCall[], i: TelemetryTargetInput): void => {
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
};

describe("conformance/telemetry-backfill-relevant", () => {
  it("debt drain in same run: registered call reports inBackfillQ=false", () => {
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
          pushCall(calls, i);
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

  it("debt drain in one impulse: registered call reports inBackfillQ=false and does not re-enqueue", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];

    run.add({
      id: "expr:drain-countercase",
      signal: "sig:ready",
      required: { flags: { changed: 1 } },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [
        (i) => {
          pushCall(calls, i);
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:drain-countercase"],
      map: { "expr:drain-countercase": true },
    };

    run.set(snapshot);

    run.impulse({
      signals: ["sig:ready"],
      addFlags: ["flag:up"],
      removeFlags: ["flag:down"],
    });

    const registeredCalls = calls.filter((call) => call.q === "registered");
    expect(registeredCalls).toHaveLength(1);
    expect(registeredCalls[0]).toEqual(
      expect.objectContaining({
        signalRuns: 1,
        flagsRuns: 1,
        runs: 2,
        inBackfillQ: false,
      }),
    );

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).not.toContain("expr:drain-countercase");
    expect(backfillQ.map["expr:drain-countercase"]).toBeUndefined();
  });

  it("pending debt after backfill pre-finalization: registered call reports inBackfillQ=true", () => {
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
          pushCall(calls, i);
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

    // Backfill pre-finalization telemetry within the same impulse.
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

    // Post-state after the same impulse: entry remains in backfill queue.
    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).toContain("expr:pending");
    expect(backfillQ.map["expr:pending"]).toBe(true);
    expect(backfillQ.list.filter((id) => id === "expr:pending").length).toBe(1);
  });

  it("keeps non-backfill-relevant telemetry fields absent and inBackfillQ=false", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];

    run.add({
      id: "expr:plain",
      targets: [
        (i) => {
          pushCall(calls, i);
        },
      ],
    });

    run.impulse({ addFlags: ["tick"] });

    const registeredCalls = calls.filter((call) => call.q === "registered");
    expect(registeredCalls).toHaveLength(1);
    const registeredCall = registeredCalls[0];
    expect(registeredCall).toBeDefined();
    expect(registeredCall?.inBackfillQ).toBe(false);
    expect(calls).toContainEqual({ q: "registered", inBackfillQ: false });
  });
});
