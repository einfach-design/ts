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
    expect(gateBackfillCalls).toEqual([
      expect.objectContaining({ gate: "signal", inBackfillQ: false }),
    ]);

    const gateRegisteredCalls = calls.filter(
      (call) =>
        call.id === "expr:integration:gate-reject" && call.q === "registered",
    );
    expect(gateRegisteredCalls).toEqual([]);

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

    expect(telemetryBackfillCall).toEqual(
      expect.objectContaining({ inBackfillQ: false }),
    );
    expect(telemetryRegisteredCall).toEqual(
      expect.objectContaining({ inBackfillQ: true }),
    );

    const byId = run.get("registeredById") as Map<
      string,
      {
        backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
      }
    >;

    expect(
      byId.get("expr:integration:gate-reject")?.backfill?.signal?.debt,
    ).toBe(0);
    expect(
      byId.get("expr:integration:gate-reject")?.backfill?.flags?.debt,
    ).toBe(0);
    expect(
      byId.get("expr:integration:telemetry-pending")?.backfill?.flags?.debt,
    ).toBe(1);

    expect(run.get("backfillQ", { as: "snapshot" })).toEqual({
      list: ["expr:integration:telemetry-pending"],
      map: { "expr:integration:telemetry-pending": true },
    });
  });
});
