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

  it("A2.1 — scope projection consistency for all RunGetKey at applied scope", () => {
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

    const scoped = run.get("*" as string | undefined, {
      scope: "applied",
      as: "snapshot",
    }) as Record<string, unknown>;

    const keys: Array<
      Exclude<import("../../src/index.types.js").RunGetKey, "*">
    > = [
      "defaults",
      "flags",
      "changedFlags",
      "seenFlags",
      "signal",
      "seenSignals",
      "impulseQ",
      "backfillQ",
      "registeredQ",
      "registeredById",
      "diagnostics",
    ];

    for (const key of keys) {
      expect(scoped[key]).toEqual(
        run.get(key, { scope: "applied", as: "snapshot" }),
      );
    }
  });

  it("A2.2 — scope projection consistency for all RunGetKey at pending scope", () => {
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

    const scoped = run.get("*" as string | undefined, {
      scope: "pending",
      as: "snapshot",
    }) as Record<string, unknown>;

    const keys: Array<
      Exclude<import("../../src/index.types.js").RunGetKey, "*">
    > = [
      "defaults",
      "flags",
      "changedFlags",
      "seenFlags",
      "signal",
      "seenSignals",
      "impulseQ",
      "backfillQ",
      "registeredQ",
      "registeredById",
      "diagnostics",
    ];

    for (const key of keys) {
      expect(scoped[key]).toEqual(
        run.get(key, { scope: "pending", as: "snapshot" }),
      );
    }
  });

  it("A2.3 — scope projection consistency for all RunGetKey at pendingOnly scope", () => {
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

    const scoped = run.get("*" as string | undefined, {
      scope: "pendingOnly",
      as: "snapshot",
    }) as Record<string, unknown>;

    const keys: Array<
      Exclude<import("../../src/index.types.js").RunGetKey, "*">
    > = [
      "defaults",
      "flags",
      "changedFlags",
      "seenFlags",
      "signal",
      "seenSignals",
      "impulseQ",
      "backfillQ",
      "registeredQ",
      "registeredById",
      "diagnostics",
    ];

    for (const key of keys) {
      expect(scoped[key]).toEqual(
        run.get(key, { scope: "pendingOnly", as: "snapshot" }),
      );
    }
  });

  it("A2.4 — get without scope must not execute scope projection path (Spec §4.1)", () => {
    const run = createRuntime();

    const entry = {
      signals: [] as string[],
      removeFlags: [] as string[],
      useFixedFlags: false,
      get addFlags(): string[] {
        throw new Error("projection.path.should.not.run");
      },
    };

    run.set({
      defaults: run.get("defaults" as string | undefined, {
        as: "snapshot",
      }) as Record<string, unknown>,
      flags: { list: [], map: {} },
      changedFlags: undefined,
      seenFlags: { list: [], map: {} },
      signal: undefined,
      seenSignals: { list: [], map: {} },
      impulseQ: {
        q: {
          entries: [entry],
          cursor: 1,
        },
        config: {
          retain: 1,
          maxBytes: Number.POSITIVE_INFINITY,
        },
      },
      backfillQ: { list: [], map: {} },
      registeredQ: [],
    });

    expect(() => run.get("flags" as string | undefined)).not.toThrow();
    expect(() =>
      run.get("flags" as string | undefined, { scope: "applied" }),
    ).toThrow("projection.path.should.not.run");
  });

  it("A2.5 — scope applied projection preserves state across trim via baseline (Spec §2.11.3, §4.1)", () => {
    const run = createRuntime();

    run.impulse({ addFlags: ["a"] });
    run.impulse({ addFlags: ["b"] });

    const scopedBeforeTrim = run.get("flags" as string | undefined, {
      scope: "applied",
      as: "snapshot",
    });

    run.set({
      impulseQ: {
        config: {
          retain: 1,
          maxBytes: Number.POSITIVE_INFINITY,
        },
      },
    });

    expect(
      run.get("impulseQ" as string | undefined, { as: "snapshot" }),
    ).toMatchObject({
      q: {
        cursor: 1,
        entries: [{ addFlags: ["b"] }],
      },
    });

    expect(
      run.get("flags" as string | undefined, {
        scope: "applied",
        as: "snapshot",
      }),
    ).toEqual(scopedBeforeTrim);

    const scopedStar = run.get("*" as string | undefined, {
      scope: "applied",
      as: "snapshot",
    }) as Record<string, unknown>;

    expect(scopedStar.flags).toEqual(
      run.get("flags" as string | undefined, {
        scope: "applied",
        as: "snapshot",
      }),
    );
  });

  it("A2.6 — retain-trim with cursor>0 keeps applied semantics and preserves pending entries", () => {
    const run = createRuntime();

    const retainedApplied = {
      signals: ["applied-2"],
      addFlags: ["b"],
      removeFlags: ["a"],
      useFixedFlags: false,
    };
    const pendingEntry = {
      signals: ["pending-1"],
      addFlags: ["c"],
      removeFlags: [],
      useFixedFlags: false,
    };

    run.set({
      defaults: run.get("defaults" as string | undefined, {
        as: "snapshot",
      }) as Record<string, unknown>,
      flags: { list: ["a", "b"], map: { a: true, b: true } },
      changedFlags: { list: ["b"], map: { b: true } },
      seenFlags: { list: ["a", "b"], map: { a: true, b: true } },
      signal: "applied-2",
      seenSignals: {
        list: ["applied-1", "applied-2"],
        map: { "applied-1": true, "applied-2": true },
      },
      impulseQ: {
        q: {
          entries: [
            {
              signals: ["applied-1"],
              addFlags: ["a"],
              removeFlags: [],
              useFixedFlags: false,
            },
            retainedApplied,
            pendingEntry,
          ],
          cursor: 2,
        },
        config: {
          retain: true,
          maxBytes: Number.POSITIVE_INFINITY,
        },
      },
      backfillQ: { list: [], map: {} },
      registeredQ: [],
    });

    const appliedBeforeTrim = run.get("flags" as string | undefined, {
      scope: "applied",
      as: "snapshot",
    });

    run.set({
      impulseQ: {
        config: {
          retain: 1,
        },
      },
    });

    const impulseQAfterTrim = run.get("impulseQ" as string | undefined, {
      as: "snapshot",
    }) as {
      q: {
        entries: Array<{ addFlags: string[]; signals: string[] }>;
        cursor: number;
      };
    };

    expect(impulseQAfterTrim.q.cursor).toBe(1);
    expect(impulseQAfterTrim.q.entries).toHaveLength(2);
    expect(
      impulseQAfterTrim.q.entries.slice(0, impulseQAfterTrim.q.cursor),
    ).toEqual([
      expect.objectContaining({ addFlags: ["b"], signals: ["applied-2"] }),
    ]);
    expect(
      impulseQAfterTrim.q.entries.slice(impulseQAfterTrim.q.cursor),
    ).toEqual([
      expect.objectContaining({ addFlags: ["c"], signals: ["pending-1"] }),
    ]);

    expect(
      run.get("flags" as string | undefined, {
        scope: "applied",
        as: "snapshot",
      }),
    ).toEqual(appliedBeforeTrim);
    expect(
      run.get("flags" as string | undefined, {
        scope: "pendingOnly",
        as: "snapshot",
      }),
    ).toEqual({
      list: ["a", "c"],
      map: { a: true, c: true },
    });
    expect(
      run.get("flags" as string | undefined, {
        scope: "pending",
        as: "snapshot",
      }),
    ).toEqual({
      list: ["b", "c"],
      map: { b: true, c: true },
    });
  });

  it("A2.7 — maxBytes-trim with deterministic entry sizes trims applied only", () => {
    const run = createRuntime();

    const appliedEntryA = {
      signals: ["applied-a"],
      addFlags: ["a"],
      removeFlags: [],
      useFixedFlags: false,
    };
    const appliedEntryB = {
      signals: ["applied-b"],
      addFlags: ["b"],
      removeFlags: [],
      useFixedFlags: false,
    };
    const appliedEntryC = {
      signals: ["applied-c"],
      addFlags: ["c"],
      removeFlags: [],
      useFixedFlags: false,
    };
    const pendingEntry = {
      signals: ["pending-d"],
      addFlags: ["d"],
      removeFlags: [],
      useFixedFlags: false,
    };

    run.set({
      defaults: run.get("defaults" as string | undefined, {
        as: "snapshot",
      }) as Record<string, unknown>,
      flags: { list: ["a", "b", "c"], map: { a: true, b: true, c: true } },
      changedFlags: { list: ["c"], map: { c: true } },
      seenFlags: {
        list: ["a", "b", "c"],
        map: { a: true, b: true, c: true },
      },
      signal: "applied-c",
      seenSignals: {
        list: ["applied-a", "applied-b", "applied-c"],
        map: { "applied-a": true, "applied-b": true, "applied-c": true },
      },
      impulseQ: {
        q: {
          entries: [appliedEntryA, appliedEntryB, appliedEntryC, pendingEntry],
          cursor: 3,
        },
        config: {
          retain: true,
          maxBytes: Number.POSITIVE_INFINITY,
        },
      },
      backfillQ: { list: [], map: {} },
      registeredQ: [],
    });

    const maxBytes =
      JSON.stringify(appliedEntryB).length +
      JSON.stringify(appliedEntryC).length;
    const appliedBeforeTrim = run.get("flags" as string | undefined, {
      scope: "applied",
      as: "snapshot",
    });

    run.set({
      impulseQ: {
        config: {
          maxBytes,
        },
      },
    });

    const impulseQAfterTrim = run.get("impulseQ" as string | undefined, {
      as: "snapshot",
    }) as {
      q: {
        entries: Array<{ addFlags: string[]; signals: string[] }>;
        cursor: number;
      };
    };

    expect(impulseQAfterTrim.q.cursor).toBe(2);
    expect(impulseQAfterTrim.q.entries).toHaveLength(3);
    expect(
      impulseQAfterTrim.q.entries.slice(0, impulseQAfterTrim.q.cursor),
    ).toEqual([
      expect.objectContaining({ addFlags: ["b"], signals: ["applied-b"] }),
      expect.objectContaining({ addFlags: ["c"], signals: ["applied-c"] }),
    ]);
    expect(
      impulseQAfterTrim.q.entries.slice(impulseQAfterTrim.q.cursor),
    ).toEqual([
      expect.objectContaining({ addFlags: ["d"], signals: ["pending-d"] }),
    ]);

    expect(
      run.get("flags" as string | undefined, {
        scope: "applied",
        as: "snapshot",
      }),
    ).toEqual(appliedBeforeTrim);
    expect(
      run.get("flags" as string | undefined, {
        scope: "pendingOnly",
        as: "snapshot",
      }),
    ).toEqual({
      list: ["a", "d"],
      map: { a: true, d: true },
    });
    expect(
      run.get("flags" as string | undefined, {
        scope: "pending",
        as: "snapshot",
      }),
    ).toEqual({
      list: ["a", "b", "c", "d"],
      map: { a: true, b: true, c: true, d: true },
    });
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

  it("A2.trim — trimming applied keeps pending projections stable", () => {
    const run = createRuntime();

    run.set({
      defaults: run.get("defaults", { as: "snapshot" }) as Record<
        string,
        unknown
      >,
      flags: { list: ["base"], map: { base: true } },
      changedFlags: { list: ["base"], map: { base: true } },
      seenFlags: { list: ["base"], map: { base: true } },
      signal: "applied-a",
      seenSignals: { list: ["applied-a"], map: { "applied-a": true } },
      impulseQ: {
        q: {
          entries: [
            {
              signals: ["applied-a"],
              addFlags: ["base"],
              removeFlags: [],
              useFixedFlags: false,
            },
            {
              signals: ["applied-b"],
              addFlags: ["b"],
              removeFlags: [],
              useFixedFlags: false,
            },
            {
              signals: ["pending-c"],
              addFlags: ["c"],
              removeFlags: [],
              useFixedFlags: false,
            },
          ],
          cursor: 2,
        },
        config: { retain: true, maxBytes: Number.POSITIVE_INFINITY },
      },
      backfillQ: { list: [], map: {} },
      registeredQ: [],
    });

    const pendingImpulseQBefore = run.get("impulseQ", {
      scope: "pendingOnly",
      as: "snapshot",
    });

    run.set({
      impulseQ: {
        config: {
          maxBytes: JSON.stringify({
            signals: ["applied-b"],
            addFlags: ["b"],
            removeFlags: [],
            useFixedFlags: false,
          }).length,
        },
      },
    });

    const pendingImpulseQAfter = run.get("impulseQ", {
      scope: "pendingOnly",
      as: "snapshot",
    });
    const appliedFlags = run.get("flags", { scope: "applied", as: "snapshot" });

    expect((pendingImpulseQAfter as { q: unknown }).q).toEqual(
      (pendingImpulseQBefore as { q: unknown }).q,
    );
    expect(appliedFlags).toEqual({
      list: ["base", "b"],
      map: { base: true, b: true },
    });
  });

  it("A2.star — scoped get('*') equals scoped single-key projections", () => {
    const run = createRuntime();
    run.impulse({ signals: ["one"], addFlags: ["a"] });
    run.impulse({ signals: ["two"], addFlags: ["b"] });

    const star = run.get("*", {
      scope: "pendingOnly",
      as: "snapshot",
    }) as Record<string, unknown>;

    expect(star.flags).toEqual(
      run.get("flags", { scope: "pendingOnly", as: "snapshot" }),
    );
    expect(star.changedFlags).toEqual(
      run.get("changedFlags", { scope: "pendingOnly", as: "snapshot" }),
    );
    expect(star.seenFlags).toEqual(
      run.get("seenFlags", { scope: "pendingOnly", as: "snapshot" }),
    );
    expect(star.signal).toEqual(
      run.get("signal", { scope: "pendingOnly", as: "snapshot" }),
    );
    expect(star.seenSignals).toEqual(
      run.get("seenSignals", { scope: "pendingOnly", as: "snapshot" }),
    );
    expect(star.impulseQ).toEqual(
      run.get("impulseQ", { scope: "pendingOnly", as: "snapshot" }),
    );
  });
});
