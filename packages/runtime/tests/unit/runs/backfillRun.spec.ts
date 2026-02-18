import { describe, expect, it } from "vitest";

import { backfillRun } from "../../../src/runs/backfillRun.js";
import { createBackfillQ } from "../../../src/state/backfillQ.js";

type Expr = {
  id: string;
  tombstone?: true;
  backfill?: {
    signal?: { debt?: number };
    flags?: { debt?: number };
  };
  marker?: string;
};

describe("runs/backfillRun", () => {
  it("uses id-based lookup, rotates within same run, and re-enqueues pending entries", () => {
    const exprAInQueue: Expr = {
      id: "x",
      marker: "queue-instance",
      backfill: { signal: { debt: 3 }, flags: { debt: 1 } },
    };

    const exprALive: Expr = {
      id: "x",
      marker: "live-instance",
      backfill: { signal: { debt: 1 }, flags: { debt: 4 } },
    };

    const exprB: Expr = {
      id: "y",
      backfill: { signal: { debt: 2 }, flags: { debt: 2 } },
    };

    const exprC: Expr = {
      id: "z",
      backfill: { signal: { debt: 1 }, flags: { debt: 0 } },
    };

    const backfillQ = createBackfillQ<Expr>();
    backfillQ.list.push(exprAInQueue, exprB, exprC);
    backfillQ.map.x = true;
    backfillQ.map.y = true;
    backfillQ.map.z = true;

    const attempts: string[] = [];
    let xSignalDeployCount = 0;

    const result = backfillRun({
      backfillQ,
      registeredById: new Map([
        ["x", exprALive],
        ["y", exprB],
      ]),
      attempt: (expr, gate) => {
        attempts.push(`${expr.id}:${expr.marker ?? "same"}:${gate}`);

        if (expr.id === "x" && gate === "flags") {
          return { status: "reject", pending: true, consumedDebt: false };
        }

        if (expr.id === "x" && gate === "signal") {
          xSignalDeployCount += 1;
          return {
            status: "deploy",
            pending: xSignalDeployCount === 1,
            consumedDebt: true,
          };
        }

        if (expr.id === "z") {
          return { status: "reject", pending: true, consumedDebt: false };
        }

        return { status: "deploy", pending: false, consumedDebt: true };
      },
    });

    expect(attempts.slice(0, 5)).toEqual([
      "x:live-instance:flags",
      "x:live-instance:signal",
      "y:same:signal",
      "z:same:signal",
      "z:same:flags",
    ]);
    expect(attempts).toContain("x:live-instance:signal");
    expect(result.iterations).toBeGreaterThan(3);
    expect(result.deployed).toBeGreaterThanOrEqual(2);
    expect(result.reEnqueued).toBe(2);

    expect(backfillQ.list.map((entry) => entry.id)).toEqual(["x", "z"]);
    expect(backfillQ.map).toEqual({ x: true, z: true });
  });

  it("dedupes duplicate ids in working snapshot and drains debt via rotation", () => {
    const queueRef: Expr = {
      id: "dup",
      marker: "queue",
      backfill: { signal: { debt: 2 }, flags: { debt: 1 } },
    };
    const liveRef: Expr = {
      id: "dup",
      marker: "live",
      backfill: { signal: { debt: 2 }, flags: { debt: 1 } },
    };

    const backfillQ = createBackfillQ<Expr>();
    backfillQ.list.push(queueRef, queueRef);
    backfillQ.map.dup = true;

    const attempts: string[] = [];

    const result = backfillRun({
      backfillQ,
      registeredById: new Map([["dup", liveRef]]),
      attempt: (expr, gate) => {
        attempts.push(`${expr.id}:${expr.marker}:${gate}`);
        return { status: "deploy", pending: false, consumedDebt: true };
      },
    });

    expect(result).toEqual({
      iterations: 3,
      attempts: 3,
      deployed: 3,
      reEnqueued: 0,
    });
    expect(attempts).toEqual([
      "dup:live:signal",
      "dup:live:signal",
      "dup:live:flags",
    ]);
    expect(backfillQ.list.map((entry) => entry.id)).toEqual([]);
    expect(backfillQ.map).toEqual({});
  });

  it("does not re-enqueue a tombstoned expression even if attempt marks pending", () => {
    const queued: Expr = {
      id: "gone",
      backfill: { signal: { debt: 1 } },
    };
    const tombstonedLive: Expr = {
      id: "gone",
      tombstone: true,
      backfill: { signal: { debt: 1 } },
    };

    const backfillQ = createBackfillQ<Expr>();
    backfillQ.list.push(queued);
    backfillQ.map.gone = true;

    const result = backfillRun({
      backfillQ,
      registeredById: new Map([["gone", tombstonedLive]]),
      attempt: () => {
        throw new Error("attempt must not run for tombstoned entries");
      },
    });

    expect(result).toEqual({
      iterations: 1,
      attempts: 0,
      deployed: 0,
      reEnqueued: 0,
    });
    expect(backfillQ.list).toEqual([]);
    expect(backfillQ.map).toEqual({});
  });

  it("supports optional maxIterations guardrail without changing default behavior", () => {
    const expr: Expr = {
      id: "loop",
      backfill: { signal: { debt: 1 }, flags: { debt: 0 } },
    };

    const backfillQ = createBackfillQ<Expr>();
    backfillQ.list.push(expr);
    backfillQ.map.loop = true;

    const result = backfillRun({
      backfillQ,
      registeredById: new Map([["loop", expr]]),
      maxIterations: 3,
      attempt: () => ({ status: "deploy", pending: true, consumedDebt: true }),
    });

    expect(result).toEqual({
      iterations: 1,
      attempts: 1,
      deployed: 1,
      reEnqueued: 0,
    });
  });
});
