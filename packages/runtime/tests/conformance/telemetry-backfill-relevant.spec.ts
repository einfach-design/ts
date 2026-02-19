import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

type TelemetryCall = {
  id: string;
  q: "backfill" | "registered";
  signalRuns?: number;
  flagsRuns?: number;
  runs?: number;
  inBackfillQ: boolean;
  gate?: "signal" | "flags";
};

type TelemetryTargetInput = {
  q: TelemetryCall["q"];
  expression: {
    id: string;
    backfillSignalRuns?: number;
    backfillFlagsRuns?: number;
    backfillRuns?: number;
    inBackfillQ: boolean;
    actBackfillGate?: "signal" | "flags";
  };
};

const pushCall = (calls: TelemetryCall[], i: TelemetryTargetInput): void => {
  calls.push({
    id: i.expression.id,
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
    ...(i.expression.actBackfillGate !== undefined
      ? { gate: i.expression.actBackfillGate }
      : {}),
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

    run.impulse({ addFlags: ["tick"] });

    const registeredCalls = calls.filter(
      (call) => call.id === "expr:drained" && call.q === "registered",
    );
    expect(registeredCalls).toHaveLength(1);
    const registeredCall = registeredCalls[0]!;
    expect(registeredCall).toEqual(
      expect.objectContaining({
        signalRuns: 1,
        flagsRuns: 0,
        runs: 1,
        inBackfillQ: false,
      }),
    );
    expect(typeof registeredCall.inBackfillQ).toBe("boolean");
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

    const registeredCalls = calls.filter(
      (call) => call.id === "expr:drain-countercase" && call.q === "registered",
    );
    expect(registeredCalls).toHaveLength(1);
    expect(registeredCalls[0]).toEqual(
      expect.objectContaining({
        signalRuns: 1,
        flagsRuns: 1,
        runs: 2,
        inBackfillQ: false,
      }),
    );
    expect(typeof registeredCalls[0]!.inBackfillQ).toBe("boolean");

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).not.toContain("expr:drain-countercase");
    expect(backfillQ.map["expr:drain-countercase"]).toBeUndefined();
  });

  it("drains debt and keeps registered inBackfillQ=false", () => {
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

    const backfillCalls = calls.filter(
      (call) =>
        call.id === "expr:pending" && call.q === "backfill" && call.runs === 1,
    );
    expect(backfillCalls).toHaveLength(1);
    expect(backfillCalls[0]).toEqual(
      expect.objectContaining({
        inBackfillQ: false,
      }),
    );

    const registeredCalls = calls.filter(
      (call) => call.id === "expr:pending" && call.q === "registered",
    );
    expect(registeredCalls).toHaveLength(1);
    expect(registeredCalls[0]).toEqual(
      expect.objectContaining({
        inBackfillQ: false,
      }),
    );
    expect(typeof registeredCalls[0]!.inBackfillQ).toBe("boolean");

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).not.toContain("expr:pending");
    expect(backfillQ.map["expr:pending"]).toBeUndefined();
  });

  it("sets registered inBackfillQ=true when pending re-enqueue occurs", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];
    const pendingId = "expr:pending-reenqueue";

    run.add({
      id: pendingId,
      signal: "sig:need",
      backfill: {
        signal: { debt: 2, runs: { max: 2 } },
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
      list: [pendingId],
      map: { [pendingId]: true },
    };

    run.set({ ...snapshot, flags: createFlagsView([]) });

    const registeredById = run.get("registeredById") as Map<
      string,
      {
        backfill?: {
          signal?: { debt?: number; runs?: { used: number; max: number } };
          flags?: { debt?: number; runs?: { used: number; max: number } };
        };
      }
    >;
    const pendingExpression = registeredById.get(pendingId);
    expect(pendingExpression).toBeDefined();
    expect(pendingExpression?.backfill?.signal?.runs).toBeDefined();
    pendingExpression!.backfill!.signal!.runs!.used =
      pendingExpression!.backfill!.signal!.runs!.max;

    run.impulse({ signals: ["sig:need"] });

    const backfillCalls = calls.filter(
      (call) => call.id === pendingId && call.q === "backfill",
    );
    const registeredCalls = calls.filter(
      (call) => call.id === pendingId && call.q === "registered",
    );

    expect(backfillCalls).toHaveLength(2);
    expect(registeredCalls).toHaveLength(1);
    for (const backfillCall of backfillCalls) {
      expect(backfillCall.inBackfillQ).toBe(false);
    }
    const registeredCall = registeredCalls[0]!;
    expect(registeredCall.inBackfillQ).toBe(true);
    expect(typeof registeredCall.inBackfillQ).toBe("boolean");

    expect(
      registeredById.get(pendingId)?.backfill?.signal?.debt,
    ).toBeGreaterThan(0);

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).toContain(pendingId);
    expect(backfillQ.map[pendingId]).toBe(true);
    expect(backfillQ.list.filter((id) => id === pendingId)).toHaveLength(1);
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

    const registeredCalls = calls.filter(
      (call) => call.id === "expr:plain" && call.q === "registered",
    );
    expect(registeredCalls).toHaveLength(1);
    const registeredCall = registeredCalls[0];
    expect(registeredCall).toBeDefined();
    expect(registeredCall?.inBackfillQ).toBe(false);
    expect(typeof registeredCall?.inBackfillQ).toBe("boolean");
    expect(calls).toContainEqual({
      id: "expr:plain",
      q: "registered",
      inBackfillQ: false,
    });
    expect(
      calls.filter(
        (call) => call.id === "expr:plain" && call.q === "registered",
      ),
    ).toHaveLength(1);
  });
});
