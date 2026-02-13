import { describe, expect, it } from "vitest";

import { actImpulse } from "../../../src/processing/actImpulse.js";
import { backfillRun } from "../../../src/runs/backfillRun.js";
import { registeredRun } from "../../../src/runs/registeredRun.js";
import { createBackfillQ } from "../../../src/state/backfillQ.js";

describe("processing/actImpulse", () => {
  it("runs backfill before registered per occurrence and supports empty-signal occurrence", () => {
    const calls: string[] = [];

    const result = actImpulse({
      entry: {
        signals: ["s1", "s2"],
        livePayload: { keep: true },
      },
      hasBackfill: true,
      runBackfill: (occurrence) => {
        calls.push(`b:${occurrence.signal}`);
      },
      runRegistered: (occurrence) => {
        calls.push(`r:${occurrence.signal}`);
      },
    });

    expect(calls).toEqual(["b:s1", "r:s1", "b:s2", "r:s2"]);
    expect(result.occurrences).toEqual([
      { index: 0, signal: "s1", payload: { keep: true } },
      { index: 1, signal: "s2", payload: { keep: true } },
    ]);

    const noSignalCalls: string[] = [];
    const noSignal = actImpulse({
      entry: { signals: [] },
      hasBackfill: false,
      runRegistered: () => {
        noSignalCalls.push("registered");
      },
    });

    expect(noSignalCalls).toEqual(["registered"]);
    expect(noSignal.occurrences).toEqual([{ index: 0 }]);
  });
});

type Expr = {
  id: string;
  tombstone?: true;
  backfill?: {
    signal?: { debt?: number };
    flags?: { debt?: number };
  };
  marker?: string;
};

describe("runs/registeredRun", () => {
  it("iterates snapshot order, skips tombstones, and enqueues on debt-entry transition", () => {
    const a: Expr = {
      id: "a",
      backfill: { signal: { debt: 0 }, flags: { debt: 0 } },
    };
    const b: Expr = {
      id: "b",
      tombstone: true,
      backfill: { signal: { debt: 0 } },
    };
    const c: Expr = {
      id: "c",
      backfill: { signal: { debt: 2 }, flags: { debt: 0 } },
    };

    const backfillQ = createBackfillQ<Expr>();
    const byId = new Map<string, Expr>([
      ["a", a],
      ["b", b],
      ["c", c],
    ]);

    const result = registeredRun({
      registeredQ: [a, b, c],
      registeredById: byId,
      backfillQ,
      matchExpression: () => true,
      coreRun: (expr) => {
        if (expr.id === "a") {
          return { status: "reject", debtDelta: { signal: 1 } };
        }

        if (expr.id === "c") {
          return { status: "reject", debtDelta: { signal: 1 } };
        }

        return { status: "deploy" };
      },
    });

    expect(result).toEqual({
      visited: 3,
      attempted: 2,
      deployed: 0,
      rejected: 2,
      debtEntries: 1,
    });
    expect(a.backfill?.signal?.debt).toBe(1);
    expect(c.backfill?.signal?.debt).toBe(3);
    expect(backfillQ.list.map((entry) => entry.id)).toEqual(["a"]);
  });
});

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
});
