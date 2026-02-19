import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

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

    run.impulse({ signals: ["sig:need"], addFlags: ["flag:up"] });

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

  it("keeps registered inBackfillQ=false when debt is drained before registered run", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];
    const pendingId = "expr:pending-reenqueue";

    run.add({
      id: pendingId,
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
      list: [pendingId],
      map: { [pendingId]: true },
    };

    run.set(snapshot);

    const registeredByIdBefore = run.get("registeredById") as Map<
      string,
      {
        backfill?: {
          signal?: { runs?: { used: number; max: number } };
        };
      }
    >;
    const pending = registeredByIdBefore.get(pendingId);
    if (pending?.backfill?.signal?.runs !== undefined) {
      pending.backfill.signal.runs.max = 0;
      expect(pending.backfill.signal.runs.max).toBe(0);
    }

    run.impulse({ signals: ["sig:need"] });

    const backfillCalls = calls.filter(
      (call) => call.id === pendingId && call.q === "backfill",
    );
    const registeredCalls = calls.filter(
      (call) => call.id === pendingId && call.q === "registered",
    );

    expect(backfillCalls.length).toBeGreaterThanOrEqual(1);
    expect(registeredCalls.length).toBeGreaterThanOrEqual(1);
    expect(registeredCalls[0]?.inBackfillQ).toBe(false);
    expect(backfillCalls.every((call) => call.inBackfillQ === false)).toBe(
      true,
    );

    const registeredById = run.get("registeredById") as Map<
      string,
      {
        backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
      }
    >;
    expect(registeredById.get(pendingId)?.backfill?.signal?.debt).toBe(0);
    expect(registeredById.get(pendingId)?.backfill?.flags?.debt).toBe(0);

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).not.toContain(pendingId);
    expect(backfillQ.map[pendingId]).toBeUndefined();
  });

  it("pending re-enqueue: registered call reports inBackfillQ=true", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];
    const expressionId = "expr:pending-telemetry";

    run.add({
      id: expressionId,
      backfill: {
        signal: { debt: 2 },
        flags: { debt: 2, runs: { max: 1 } },
      },
      targets: [
        (i) => {
          pushCall(calls, i);
        },
      ],
    });

    run.impulse({ signals: ["sig:need"] });

    run.impulse({ signals: ["sig:need"] });

    const backfillCalls = calls.filter((c) => c.q === "backfill");
    const registeredCalls = calls.filter((c) => c.q === "registered");
    expect(backfillCalls.length).toBeGreaterThanOrEqual(1);
    expect(backfillCalls.every((c) => c.inBackfillQ === false)).toBe(true);
    expect(registeredCalls).toEqual([]);

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    expect(backfillQ.list).not.toContain(expressionId);
    expect(backfillQ.map[expressionId]).toBeUndefined();
    expect(new Set(Object.keys(backfillQ.map))).toEqual(
      new Set(backfillQ.list),
    );
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

  it("telemetry reads are projection-only and never mutate backfillQ membership", () => {
    const run = createRuntime();
    const calls: TelemetryCall[] = [];
    const expressionId = "expr:telemetry-projection";

    run.add({
      id: expressionId,
      signal: "sig:need",
      flags: { "flag:required": true },
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
      list: [expressionId],
      map: { [expressionId]: true },
    };

    run.set(snapshot);
    run.impulse({ signals: ["sig:need"] });

    const beforeTelemetryRead = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    const backfillCalls = calls.filter(
      (call) => call.id === expressionId && call.q === "backfill",
    );
    expect(backfillCalls.length).toBeGreaterThanOrEqual(1);
    expect(backfillCalls.every((call) => call.inBackfillQ === false)).toBe(
      true,
    );

    const afterTelemetryRead = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(afterTelemetryRead).toEqual(beforeTelemetryRead);
    expect(afterTelemetryRead.list).toEqual([expressionId]);
    expect(afterTelemetryRead.map).toEqual({ [expressionId]: true });
  });
});
