import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

type Call = {
  id: string;
  q: "backfill" | "registered";
  inBackfillQ: boolean;
  gate?: "signal" | "flags";
  signalRuns?: number;
  flagsRuns?: number;
  runs?: number;
};

type TelemetryTargetInput = {
  q: Call["q"];
  expression: {
    id: string;
    inBackfillQ: boolean;
    actBackfillGate?: "signal" | "flags";
    backfillSignalRuns?: number;
    backfillFlagsRuns?: number;
    backfillRuns?: number;
  };
};

const collectTelemetryCall = (calls: Call[], i: TelemetryTargetInput): void => {
  calls.push({
    id: i.expression.id,
    q: i.q,
    inBackfillQ: i.expression.inBackfillQ,
    ...(i.expression.actBackfillGate !== undefined
      ? { gate: i.expression.actBackfillGate }
      : {}),
    ...(i.expression.backfillSignalRuns !== undefined
      ? { signalRuns: i.expression.backfillSignalRuns }
      : {}),
    ...(i.expression.backfillFlagsRuns !== undefined
      ? { flagsRuns: i.expression.backfillFlagsRuns }
      : {}),
    ...(i.expression.backfillRuns !== undefined
      ? { runs: i.expression.backfillRuns }
      : {}),
  });
};

describe("conformance/backfill-telemetry-gate-integration", () => {
  it("keeps gate reject, pending re-enqueue, and telemetry inBackfillQ semantics deterministic", () => {
    const run = createRuntime();
    const calls: Call[] = [];

    run.add({
      id: "expr:integration:gate-reject",
      signal: "sig:need",
      flags: { must: true },
      required: { flags: { changed: 0 } },
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 0 },
      },
      targets: [
        (i) => {
          collectTelemetryCall(calls, i);
        },
      ],
    });

    run.add({
      id: "expr:integration:telemetry-pending",
      signal: "sig:need",
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 1 },
      },
      targets: [
        (i) => {
          collectTelemetryCall(calls, i);
        },
      ],
    });

    run.add({
      id: "expr:integration:drain",
      signal: "sig:need",
      backfill: {
        signal: { debt: 1 },
        flags: { debt: 0 },
      },
      targets: [
        (i) => {
          collectTelemetryCall(calls, i);
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: [
        "expr:integration:gate-reject",
        "expr:integration:telemetry-pending",
        "expr:integration:drain",
      ],
      map: {
        "expr:integration:gate-reject": true,
        "expr:integration:telemetry-pending": true,
        "expr:integration:drain": true,
      },
    };

    run.set({ ...snapshot, flags: createFlagsView([]) });

    run.impulse({ signals: ["sig:need"] });

    const gateBackfillCalls = calls.filter(
      (call) =>
        call.id === "expr:integration:gate-reject" && call.q === "backfill",
    );
    expect(gateBackfillCalls).toHaveLength(1);
    expect(gateBackfillCalls[0]).toEqual(
      expect.objectContaining({ gate: "signal", inBackfillQ: false }),
    );
    expect(gateBackfillCalls.map((call) => call.gate)).toEqual(["signal"]);

    const gateRegisteredCalls = calls.filter(
      (call) =>
        call.id === "expr:integration:gate-reject" && call.q === "registered",
    );
    expect(gateRegisteredCalls).toHaveLength(0);

    const telemetryBackfillCalls = calls.filter(
      (call) =>
        call.id === "expr:integration:telemetry-pending" &&
        call.q === "backfill",
    );
    const telemetryRegisteredCalls = calls.filter(
      (call) =>
        call.id === "expr:integration:telemetry-pending" &&
        call.q === "registered",
    );

    expect(telemetryBackfillCalls).toHaveLength(2);
    expect(telemetryRegisteredCalls).toHaveLength(1);
    expect(telemetryBackfillCalls[0]!.inBackfillQ).toBe(false);
    expect(telemetryRegisteredCalls[0]!.inBackfillQ).toBe(false);
    expect(typeof telemetryRegisteredCalls[0]!.inBackfillQ).toBe("boolean");

    const drainBackfillCalls = calls.filter(
      (call) => call.id === "expr:integration:drain" && call.q === "backfill",
    );
    const drainRegisteredCalls = calls.filter(
      (call) => call.id === "expr:integration:drain" && call.q === "registered",
    );

    expect(drainBackfillCalls).toHaveLength(1);
    expect(drainBackfillCalls[0]!.inBackfillQ).toBe(false);
    expect(drainRegisteredCalls).toHaveLength(1);
    expect(drainRegisteredCalls[0]!.inBackfillQ).toBe(false);
    expect(typeof drainRegisteredCalls[0]!.inBackfillQ).toBe("boolean");

    const registeredById = run.get("registeredById") as Map<
      string,
      {
        backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
      }
    >;

    expect(
      registeredById.get("expr:integration:gate-reject")?.backfill?.signal
        ?.debt,
    ).toBe(0);
    expect(
      registeredById.get("expr:integration:gate-reject")?.backfill?.flags?.debt,
    ).toBe(0);
    expect(
      registeredById.get("expr:integration:telemetry-pending")?.backfill?.flags
        ?.debt,
    ).toBe(0);
    expect(
      registeredById.get("expr:integration:drain")?.backfill?.signal?.debt,
    ).toBe(0);
    expect(
      registeredById.get("expr:integration:drain")?.backfill?.flags?.debt,
    ).toBe(0);

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    expect(backfillQ.list).not.toContain("expr:integration:gate-reject");
    expect(backfillQ.map["expr:integration:gate-reject"]).toBeUndefined();

    expect(backfillQ.list).not.toContain("expr:integration:telemetry-pending");
    expect(backfillQ.map["expr:integration:telemetry-pending"]).toBeUndefined();

    expect(backfillQ.list).not.toContain("expr:integration:drain");
    expect(backfillQ.map["expr:integration:drain"]).toBeUndefined();
  });
});
