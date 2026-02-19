import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

type Call = {
  id: string;
  q: "backfill" | "registered";
  inBackfillQ: boolean;
  gate?: "signal" | "flags";
};

type TelemetryTargetInput = {
  q: Call["q"];
  expression: {
    id: string;
    inBackfillQ: boolean;
    actBackfillGate?: "signal" | "flags";
  };
};

const collectCall = (calls: Call[], i: TelemetryTargetInput): void => {
  calls.push({
    id: i.expression.id,
    q: i.q,
    inBackfillQ: i.expression.inBackfillQ,
    ...(i.expression.actBackfillGate !== undefined
      ? { gate: i.expression.actBackfillGate }
      : {}),
  });
};

describe("conformance/flags-gate-no-changes-reject", () => {
  // This test freezes the runtime guard in src/runtime/index.ts.
  // It intentionally drives a flags-gated backfill attempt with changedFlags=0,
  // so the early-reject branch for gate="flags" is exercised deterministically.
  it("rejects flags-gated backfill attempts with unchanged flags and matching signal", () => {
    const run = createRuntime();
    const calls: Call[] = [];

    run.add({
      id: "expr:flags:no-changes",
      signal: "sig:need",
      required: { flags: { changed: 0 } },
      backfill: {
        signal: { debt: 0 },
        flags: { debt: 2 },
      },
      targets: [
        (i) => {
          collectCall(calls, i);
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:flags:no-changes"],
      map: { "expr:flags:no-changes": true },
    };

    run.set({ ...snapshot, flags: createFlagsView([]) });

    run.impulse({ signals: ["sig:need"] });

    const backfillCalls = calls.filter(
      (call) => call.id === "expr:flags:no-changes" && call.q === "backfill",
    );
    expect(backfillCalls).toHaveLength(1);
    const backfillCall = backfillCalls[0];
    expect(backfillCall).toEqual(
      expect.objectContaining({ gate: "signal", inBackfillQ: false }),
    );

    const registeredCalls = calls.filter(
      (call) => call.id === "expr:flags:no-changes" && call.q === "registered",
    );
    expect(registeredCalls).toHaveLength(1);
    expect(typeof registeredCalls[0]!.inBackfillQ).toBe("boolean");

    const registeredById = run.get("registeredById") as Map<
      string,
      {
        backfill?: { signal?: { debt?: number }; flags?: { debt?: number } };
      }
    >;

    expect(
      registeredById.get("expr:flags:no-changes")?.backfill?.signal?.debt,
    ).toBe(0);
    expect(
      registeredById.get("expr:flags:no-changes")?.backfill?.flags?.debt,
    ).toBe(2);

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).toContain("expr:flags:no-changes");
    expect(backfillQ.map["expr:flags:no-changes"]).toBe(true);
    expect(
      backfillQ.list.filter((id) => id === "expr:flags:no-changes"),
    ).toHaveLength(1);
  });

  it("does not early-reject when flags changed; allows normal flags-gate path", () => {
    const run = createRuntime();
    const calls: Call[] = [];

    run.add({
      id: "expr:flags:changed",
      signal: "sig:need",
      required: { flags: { changed: 0 } },
      backfill: {
        signal: { debt: 0 },
        flags: { debt: 2 },
      },
      targets: [
        (i) => {
          collectCall(calls, i);
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;

    snapshot.backfillQ = {
      list: ["expr:flags:changed"],
      map: { "expr:flags:changed": true },
    };

    run.set({ ...snapshot, flags: createFlagsView([]) });

    run.impulse({ signals: ["sig:need"], addFlags: ["flag:tick"] });

    const backfillCalls = calls.filter(
      (call) => call.id === "expr:flags:changed" && call.q === "backfill",
    );
    expect(backfillCalls).toHaveLength(2);
    expect(backfillCalls.map((call) => call.gate)).toEqual(["flags", "flags"]);
    expect(backfillCalls[0]).toEqual(
      expect.objectContaining({ gate: "flags", inBackfillQ: false }),
    );

    const registeredCalls = calls.filter(
      (call) => call.id === "expr:flags:changed" && call.q === "registered",
    );
    expect(registeredCalls).toHaveLength(1);
    expect(registeredCalls[0]).toEqual(
      expect.objectContaining({ inBackfillQ: false }),
    );

    const backfillQ = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(backfillQ.list).not.toContain("expr:flags:changed");
    expect(backfillQ.map["expr:flags:changed"]).toBeUndefined();
  });
});
