import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

type ContextShape = {
  seq: number;
  id: string;
  q: "backfill" | "registered";
  signal?: string;
  expression: {
    id: string;
    backfillSignalRuns: number;
    backfillFlagsRuns: number;
    backfillRuns: number;
    actBackfillGate?: "signal" | "flags";
    inBackfillQ?: boolean;
  };
};

describe("conformance/impulse-context", () => {
  it("provides seq/id/q and expression telemetry on target context", () => {
    const run = createRuntime();
    const producerCalls: ContextShape[] = [];
    const e1Calls: ContextShape[] = [];
    const e2Calls: ContextShape[] = [];

    run.add({
      id: "expr:producer",
      signal: "seed",
      backfill: { signal: { debt: 1 } },
      targets: [
        (i) => {
          producerCalls.push(i as ContextShape);
        },
      ],
    });

    const hydration = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;
    hydration.backfillQ = {
      list: ["expr:producer"],
      map: { "expr:producer": true },
    };
    run.set(hydration);

    run.add({
      id: "expr:e1",
      signals: ["seed", "other"],
      targets: [
        (i) => {
          e1Calls.push(i as ContextShape);
        },
      ],
    });

    run.add({
      id: "expr:e2",
      signals: ["seed", "other"],
      targets: [
        (i) => {
          e2Calls.push(i as ContextShape);
        },
      ],
    });

    run.impulse({ signals: ["seed", "other"] });

    const allCalls = [...producerCalls, ...e1Calls, ...e2Calls];
    expect(allCalls.length).toBeGreaterThan(0);

    const seqs = allCalls.map((call) => call.seq);
    for (const seq of seqs) {
      expect(seq).toBeGreaterThan(0);
    }

    const uniqueSeqs = [...new Set(seqs)].sort((a, b) => a - b);
    for (let index = 1; index < uniqueSeqs.length; index += 1) {
      expect(uniqueSeqs[index]!).toBeGreaterThan(uniqueSeqs[index - 1]!);
    }

    const bySeq = new Map<number, ContextShape[]>();
    for (const call of allCalls) {
      const group = bySeq.get(call.seq) ?? [];
      group.push(call);
      bySeq.set(call.seq, group);
    }

    for (const [seq, group] of bySeq.entries()) {
      const ids = [...new Set(group.map((call) => call.id))];
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe(`occ:${seq}`);
    }

    const uniqueIds = new Set(allCalls.map((call) => call.id));
    expect(uniqueIds.size).toBe(uniqueSeqs.length);

    expect(allCalls.some((call) => call.q === "backfill")).toBe(true);
    expect(allCalls.some((call) => call.q === "registered")).toBe(true);

    for (const call of allCalls) {
      expect(call.expression.backfillRuns).toBe(
        call.expression.backfillSignalRuns + call.expression.backfillFlagsRuns,
      );

      if (call.q === "registered" && call.expression.id === "expr:producer") {
        expect(typeof call.expression.inBackfillQ).toBe("boolean");
      }

      if (call.q === "backfill" && call.expression.id === "expr:producer") {
        expect(["signal", "flags"]).toContain(call.expression.actBackfillGate);
      }
    }
  });
});
