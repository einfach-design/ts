import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

type Call = {
  id: string;
  q: "backfill" | "registered";
  inBackfillQ: boolean;
  gate?: "signal" | "flags";
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
          calls.push({
            id: i.expression.id,
            q: i.q,
            inBackfillQ: i.expression.inBackfillQ,
            ...(i.expression.actBackfillGate !== undefined
              ? { gate: i.expression.actBackfillGate }
              : {}),
          });
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
          calls.push({
            id: i.expression.id,
            q: i.q,
            inBackfillQ: i.expression.inBackfillQ,
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
      list: [
        "expr:integration:gate-reject",
        "expr:integration:telemetry-pending",
      ],
      map: {
        "expr:integration:gate-reject": true,
        "expr:integration:telemetry-pending": true,
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

    const gateRejectReasons = gateBackfillCalls
      .map((call) => call.gate)
      .filter((gate): gate is "signal" | "flags" => gate !== undefined);
    expect(gateRejectReasons).toEqual(["signal"]);

    const gateRegisteredCalls = calls.filter(
      (call) =>
        call.id === "expr:integration:gate-reject" && call.q === "registered",
    );
    expect(gateRegisteredCalls).toHaveLength(0);

    const telemetryBackfillCall = calls.find(
      (call) =>
        call.id === "expr:integration:telemetry-pending" &&
        call.q === "backfill",
    );
    const telemetryRegisteredCall = calls.find(
      (call) =>
        call.id === "expr:integration:telemetry-pending" &&
        call.q === "registered",
    );

    expect(telemetryBackfillCall).toBeDefined();
    expect(telemetryBackfillCall?.inBackfillQ).toBe(false);
    expect(telemetryRegisteredCall).toBeDefined();
    expect(telemetryRegisteredCall?.inBackfillQ).toBe(true);

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
    ).toBeGreaterThan(0);

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    expect(backfillQ.list).not.toContain("expr:integration:gate-reject");
    expect(backfillQ.map["expr:integration:gate-reject"]).toBeUndefined();
    expect(backfillQ.list).toContain("expr:integration:telemetry-pending");
    expect(backfillQ.map).toHaveProperty("expr:integration:telemetry-pending");
  });
});
