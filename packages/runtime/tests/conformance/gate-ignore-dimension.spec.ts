import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

describe("conformance/gate-ignore-dimension", () => {
  it("ignores flags dimension when gate.flags=false", () => {
    const run = createRuntime();
    const calls: string[] = [];

    run.add({
      id: "expr:ignore-flags",
      signal: "sig:ok",
      flags: { must: true },
      required: { flags: { changed: 0 } },
      backfill: { signal: { debt: 1 }, flags: { debt: 0 } },
      targets: [
        (i) => {
          calls.push(`${i.q}:${i.expression.actBackfillGate ?? "registered"}`);
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;
    snapshot.backfillQ = {
      list: ["expr:ignore-flags"],
      map: { "expr:ignore-flags": true },
    };

    run.set({ ...snapshot, flags: createFlagsView([]) });
    run.impulse({ signals: ["sig:ok"] });

    expect(calls).toContain("backfill:signal");
  });

  it("ignores signal dimension when gate.signal=false", () => {
    const run = createRuntime();
    const calls: string[] = [];

    run.add({
      id: "expr:ignore-signal",
      signal: "sig:expected",
      flags: { must: true },
      required: { flags: { changed: 0 } },
      backfill: { signal: { debt: 0 }, flags: { debt: 1 } },
      targets: [
        (i) => {
          calls.push(`${i.q}:${i.expression.actBackfillGate ?? "registered"}`);
        },
      ],
    });

    const snapshot = run.get("*", { as: "snapshot" }) as {
      backfillQ: { list: string[]; map: Record<string, true> };
    } & Record<string, unknown>;
    snapshot.backfillQ = {
      list: ["expr:ignore-signal"],
      map: { "expr:ignore-signal": true },
    };

    run.set({ ...snapshot, flags: createFlagsView(["must"]) });
    run.impulse({ signals: ["sig:wrong"] });

    expect(calls).toContain("backfill:flags");
  });

  it("rejects without gate when one dimension does not match", () => {
    const run = createRuntime();
    const calls: Array<{ q: string; id: string }> = [];

    run.add({
      id: "expr:no-gate:signal-mismatch",
      signal: "sig:expected",
      flags: { must: true },
      required: { flags: { changed: 0 } },
      targets: [
        (i) => {
          calls.push({ q: i.q, id: i.expression.id });
        },
      ],
    });

    run.add({
      id: "expr:no-gate:flags-mismatch",
      signal: "sig:ok",
      flags: { must: true },
      required: { flags: { changed: 0 } },
      targets: [
        (i) => {
          calls.push({ q: i.q, id: i.expression.id });
        },
      ],
    });

    run.set({ flags: createFlagsView([]) });
    run.impulse({ signals: ["sig:wrong"] });

    expect(calls).toEqual([]);
    const registeredById = run.get("registeredById") as Map<string, unknown>;
    expect(registeredById.has("expr:no-gate:signal-mismatch")).toBe(true);
    expect(registeredById.has("expr:no-gate:flags-mismatch")).toBe(true);
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual({
      list: [],
      map: {},
    });
  });
});
