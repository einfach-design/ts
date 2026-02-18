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
  it("uses id-based lookup, does primary+opposite attempts, rotates on deploy+pending, and re-enqueues pending", () => {
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
          return { status: "reject", pending: true };
        }

        if (expr.id === "x" && gate === "signal") {
          xSignalDeployCount += 1;
          return {
            status: "deploy",
            pending: xSignalDeployCount === 1,
          };
        }

        if (expr.id === "z") {
          return { status: "reject", pending: true };
        }

        return { status: "deploy", pending: false };
      },
    });

    expect(attempts).toEqual([
      "x:live-instance:flags",
      "x:live-instance:signal",
      "y:same:signal",
      "z:same:signal",
      "z:same:flags",
      "x:live-instance:flags",
      "x:live-instance:signal",
    ]);

    expect(result).toEqual({
      iterations: 4,
      attempts: 7,
      deployed: 3,
      reEnqueued: 1,
    });

    expect(backfillQ.list.map((entry) => entry.id)).toEqual(["z"]);
    expect(backfillQ.map).toEqual({ z: true });
  });

  it("dedupes duplicate ids in working snapshot and only deploys once per cycle", () => {
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
        return { status: "deploy", pending: false };
      },
    });

    expect(result).toEqual({
      iterations: 1,
      attempts: 1,
      deployed: 1,
      reEnqueued: 0,
    });
    expect(attempts).toEqual(["dup:live:signal"]);
    expect(backfillQ.list).toEqual([]);
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

    expect(() =>
      backfillRun({
        backfillQ,
        registeredById: new Map([["loop", expr]]),
        maxIterations: 3,
        attempt: () => ({ status: "deploy", pending: true }),
      }),
    ).toThrowError("backfillRun exceeded configured maxIterations (3).");
  });
});
