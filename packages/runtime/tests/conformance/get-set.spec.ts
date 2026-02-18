/**
 * @file packages/runtime/tests/conformance/get-set.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 *
 * P0 Conformance: get/set behaviors
 *
 * Spec refs:
 * - §4.1 get
 * - §4.2 set
 * - §6.2 changedFlags/delta
 */
import { describe, it, expect } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("conformance/get-set", () => {
  it("A1 — get(unknown) must throw (Spec §4.1)", () => {
    const run = createRuntime();
    expect(() => run.get("unknown-key" as string | undefined)).toThrow();
  });

  it("A2 — scope projection: applied vs pending vs pendingOnly (Spec §4.1)", () => {
    const run = createRuntime();

    run.set({
      defaults: run.get("defaults" as string | undefined, {
        as: "snapshot",
      }) as Record<string, unknown>,
      flags: { list: ["a"], map: { a: true } },
      changedFlags: { list: ["a"], map: { a: true } },
      seenFlags: { list: ["a"], map: { a: true } },
      signal: "applied-signal",
      seenSignals: {
        list: ["applied-signal"],
        map: { "applied-signal": true },
      },
      impulseQ: {
        q: {
          entries: [
            {
              signals: ["applied-signal"],
              addFlags: ["a"],
              removeFlags: [],
              useFixedFlags: false,
            },
            {
              signals: ["pending-signal"],
              addFlags: ["b"],
              removeFlags: [],
              useFixedFlags: false,
            },
          ],
          cursor: 1,
        },
        config: {
          retain: 0,
          maxBytes: Number.POSITIVE_INFINITY,
        },
      },
      backfillQ: { list: [], map: {} },
      registeredQ: [],
    });

    expect(
      run.get("flags" as string | undefined, { scope: "applied" }),
    ).toEqual({
      list: ["a"],
      map: { a: true },
    });
    expect(
      run.get("flags" as string | undefined, { scope: "pending" }),
    ).toEqual({
      list: ["a", "b"],
      map: { a: true, b: true },
    });
    expect(
      run.get("flags" as string | undefined, { scope: "pendingOnly" }),
    ).toEqual({
      list: ["b"],
      map: { b: true },
    });

    expect(
      run.get("seenFlags" as string | undefined, { scope: "pendingOnly" }),
    ).toEqual({
      list: ["b"],
      map: { b: true },
    });

    expect(run.get("signal" as string | undefined, { scope: "applied" })).toBe(
      "applied-signal",
    );
    expect(run.get("signal" as string | undefined, { scope: "pending" })).toBe(
      "pending-signal",
    );
    expect(
      run.get("signal" as string | undefined, { scope: "pendingOnly" }),
    ).toBe("pending-signal");

    expect(
      run.get("seenSignals" as string | undefined, { scope: "pendingOnly" }),
    ).toEqual({
      list: ["pending-signal"],
      map: { "pending-signal": true },
    });

    const pendingQ = run.get("impulseQ" as string | undefined, {
      scope: "pending",
      as: "snapshot",
    }) as {
      q: {
        cursor: number;
        entries: readonly unknown[];
      };
    };

    expect(
      run.get("impulseQ" as string | undefined, { scope: "applied" }),
    ).toEqual({
      q: {
        cursor: pendingQ.q.cursor,
        entries: pendingQ.q.entries.slice(0, pendingQ.q.cursor),
      },
      config: {
        retain: 0,
        maxBytes: Number.POSITIVE_INFINITY,
      },
    });
    // Spec §4.1 + §4.3: scoped run.get("*") must project the same pending/applied state as keyed reads.
    expect(
      run.get("*" as string | undefined, { scope: "applied" }),
    ).toMatchObject({
      flags: { list: ["a"], map: { a: true } },
      signal: "applied-signal",
      seenSignals: {
        list: ["applied-signal"],
        map: { "applied-signal": true },
      },
    });
    expect(
      run.get("*" as string | undefined, { scope: "pendingOnly" }),
    ).toMatchObject({
      flags: { list: ["b"], map: { b: true } },
      signal: "pending-signal",
      seenSignals: {
        list: ["pending-signal"],
        map: { "pending-signal": true },
      },
    });
  });

  it("A2b — scoped get('*') must be trim-safe and side-effect free (Spec §4.1, §4.3)", () => {
    const run = createRuntime();
    const trims: Array<{ reason: string }> = [];

    run.impulse({ addFlags: ["a"] });
    run.impulse({ addFlags: ["b"] });

    run.set({
      impulseQ: {
        config: {
          maxBytes: 0,
          onTrim: (info: { stats: { reason: "retain" | "maxBytes" } }) => {
            trims.push({ reason: info.stats.reason });
          },
        },
      },
    });

    const before = run.get("impulseQ" as string | undefined, {
      as: "snapshot",
    });

    const projected = run.get("*" as string | undefined, {
      scope: "pendingOnly",
      as: "snapshot",
    }) as { impulseQ: { q: { entries: unknown[]; cursor: number } } };

    const after = run.get("impulseQ" as string | undefined, {
      as: "snapshot",
    });

    // Spec §4.1 + §4.3: scoped reads must not mutate queue state or trigger extra trim work.
    expect(projected.impulseQ.q.cursor).toBe(0);
    expect(trims.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });

  it("A3 — snapshot must tolerate opaque/cyclic livePayload values (Spec §4.1)", () => {
    const run = createRuntime();
    const livePayload: {
      fn: () => string;
      node?: unknown;
    } = {
      fn: () => "ok",
    };
    livePayload.node = livePayload;

    run.impulse({
      signals: ["opaque"],
      livePayload,
    });

    const impulseQ = run.get("impulseQ" as string | undefined, {
      as: "snapshot",
    }) as {
      q: {
        entries: Array<{
          livePayload?: {
            fn: () => string;
            node?: unknown;
          };
        }>;
      };
    };

    expect(impulseQ.q.entries).toHaveLength(1);
    expect(impulseQ.q.entries[0]?.livePayload?.fn).toBe(livePayload.fn);
    expect(impulseQ.q.entries[0]?.livePayload?.node).toBe(
      impulseQ.q.entries[0]?.livePayload,
    );
  });
  it("B1 — set(flagsTruth) must not compute changedFlags implicitly (Spec §4.2)", () => {
    const run = createRuntime();

    // baseline flags
    run.set({
      flags: { list: ["a"], map: { a: true } },
    } as Record<string, unknown>);

    // update flags truth without explicitly setting changedFlags
    run.set({
      flags: { list: ["a", "b"], map: { a: true, b: true } },
    } as Record<string, unknown>);

    const changed = run.get("changedFlags" as string | undefined) as unknown;

    // Spec expectation: changedFlags must NOT be auto-diffed when only flagsTruth is patched.
    // Fail if "b" appears implicitly.
    const changedList: string[] =
      changed && typeof changed === "object"
        ? (() => {
            const changedObj = changed as Record<string, unknown>;
            const list = changedObj.list;
            return Array.isArray(list) ? (list as string[]) : [];
          })()
        : [];

    expect(changedList).not.toContain("b");
  });

  it("B2 — set must reject invalid patch shapes (Spec §4.2)", () => {
    const run = createRuntime();

    // forbidden queue mutation (should throw per spec)
    expect(() =>
      run.set({ impulseQ: { q: { entries: [] } } } as Record<string, unknown>),
    ).toThrow();

    // unknown keys must be rejected (should throw per spec)
    expect(() =>
      run.set({ totallyUnknownKey: 123 } as Record<string, unknown>),
    ).toThrow();
  });

  it("B3 — hydration must require full snapshot shape (Spec §4.2)", () => {
    const run = createRuntime();
    const snapshot = run.get("*" as string | undefined, {
      as: "snapshot",
    }) as Record<string, unknown>;

    const incomplete = { ...snapshot };
    delete incomplete.defaults;

    expect(() => run.set(incomplete)).toThrow("set.hydration.incomplete");
  });

  it("B4 — patch must reject changedFlags and preserve hydration changedFlags (Spec §4.2)", () => {
    const run = createRuntime();

    expect(() =>
      run.set({ changedFlags: { list: ["x"], map: { x: true } } }),
    ).toThrow();

    const snapshot = run.get("*" as string | undefined, {
      as: "snapshot",
    }) as Record<string, unknown>;

    run.set({
      ...snapshot,
      changedFlags: { list: ["h"], map: { h: true } },
      backfillQ: { list: [] },
    });

    expect(run.get("changedFlags" as string | undefined)).toEqual({
      list: ["h"],
      map: { h: true },
    });
  });

  it("B5 — impulseQ config patch must be supported and q patch must throw (Spec §4.2.1)", () => {
    const run = createRuntime();

    run.impulse({ addFlags: ["a"] });

    run.set({
      impulseQ: {
        config: {
          retain: 0,
          maxBytes: Number.POSITIVE_INFINITY,
        },
      },
    });

    const impulseQ = run.get("impulseQ" as string | undefined) as {
      q: { entries: unknown[]; cursor: number };
      config: { retain: number | boolean; maxBytes: number };
    };

    expect(impulseQ.config.retain).toBe(0);
    expect(impulseQ.q.entries).toHaveLength(0);
    expect(impulseQ.q.cursor).toBe(0);

    expect(() =>
      run.set({ impulseQ: { q: { entries: [] } } } as Record<string, unknown>),
    ).toThrow("set.patch.impulseQ.q.forbidden");
  });
});
