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

  it("A1b — set(addFlags) accepts FlagsView delta payloads (Spec §2.5, §4.2)", () => {
    const run = createRuntime();

    run.set({
      addFlags: { list: ["a"], map: { a: true } },
    } as unknown as Record<string, unknown>);

    const flags = run.get("flags") as { list: string[] };
    expect(flags.list).toContain("a");
  });

  it("A1c — set patch must be atomic when a later key is invalid", () => {
    const run = createRuntime();
    run.set({ flags: { list: ["x"], map: { x: true } } } as unknown as Record<
      string,
      unknown
    >);

    expect(() =>
      run.set({
        flags: { list: ["y"], map: { y: true } },
        impulseQ: null,
      } as unknown as Record<string, unknown>),
    ).toThrow("set.impulseQ.invalid");

    expect((run.get("flags") as { list: string[] }).list).toEqual(["x"]);
  });

  it("A1d — hydration set must be atomic when impulseQ is invalid", () => {
    const run = createRuntime();
    run.set({ flags: { list: ["x"], map: { x: true } } } as unknown as Record<
      string,
      unknown
    >);

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;
    s.flags = { list: ["y"], map: { y: true } };
    s.impulseQ = null;

    expect(() => run.set(s)).toThrow("set.impulseQ.invalid");
    expect((run.get("flags") as { list: string[] }).list).toEqual(["x"]);
  });

  it("A1e — defaults.scope invalid value must throw set.defaults.invalid", () => {
    const run = createRuntime();

    expect(() =>
      run.set({ defaults: { scope: "banana" } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.defaults.invalid");
  });
  it("A1f — hydration defaults must not keep external references", () => {
    const run = createRuntime();
    run.set({ defaults: { scope: "pendingOnly" } } as unknown as Record<
      string,
      unknown
    >);
    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;

    run.set(s);
    (
      s.defaults as {
        scope: { signal: { value: string } };
      }
    ).scope.signal.value = "applied";
    (
      s.defaults as {
        gate: { signal: { value: boolean } };
      }
    ).gate.signal.value = false;

    const defaults = run.get("defaults") as {
      scope: {
        signal: { value: string };
        flags: { value: string };
      };
    };

    expect(defaults.scope.signal.value).toBe("pendingOnly");
    expect(defaults.scope.flags.value).toBe("pendingOnly");
  });

  it("A1g — defaults.gate.value must be boolean (Patch)", () => {
    const run = createRuntime();

    expect(() =>
      run.set({
        defaults: { gate: { signal: { value: "banana" } } },
      } as unknown as Record<string, unknown>),
    ).toThrow("set.defaults.invalid");
  });

  it("A1h — hydration impulseQ entries must not keep external references", () => {
    const run = createRuntime();
    run.set({ impulseQ: { config: { retain: true } } } as Record<
      string,
      unknown
    >);
    run.impulse({ signals: ["a"] } as Record<string, unknown>);
    const s = run.get("*", { as: "snapshot" }) as {
      impulseQ: { q: { entries: Array<{ signals: string[] }> } };
    };

    run.set(s as unknown as Record<string, unknown>);
    s.impulseQ.q.entries[0]!.signals.push("MUT");

    expect(
      (
        run.get("impulseQ", { as: "snapshot" }) as {
          q: { entries: Array<{ signals: string[] }> };
        }
      ).q.entries[0]!.signals,
    ).toEqual(["a"]);
  });

  it("A1i — run.impulse must not keep external references to input arrays", () => {
    const run = createRuntime();
    run.set({ impulseQ: { config: { retain: true } } } as Record<
      string,
      unknown
    >);
    const signals = ["a"];

    run.impulse({ signals } as Record<string, unknown>);
    signals.push("MUT");

    expect(
      (
        run.get("impulseQ", { as: "snapshot" }) as {
          q: { entries: Array<{ signals: string[] }> };
        }
      ).q.entries[0]!.signals,
    ).toEqual(["a"]);
  });

  it("A1j — get(snapshot) impulseQ entries must not keep external references", () => {
    const run = createRuntime();
    run.set({ impulseQ: { config: { retain: true } } } as Record<
      string,
      unknown
    >);
    run.impulse({ signals: ["a"] } as Record<string, unknown>);

    const snap = run.get("impulseQ" as string | undefined, {
      as: "snapshot",
    }) as {
      q: { entries: Array<{ signals: string[] }> };
    };

    snap.q.entries[0]!.signals.push("MUT");

    expect(
      (
        run.get("impulseQ" as string | undefined, {
          as: "snapshot",
        }) as {
          q: { entries: Array<{ signals: string[] }> };
        }
      ).q.entries[0]!.signals,
    ).toEqual(["a"]);
  });

  it("A1l — snapshot must preserve non-plain object references (opaque payload)", () => {
    const run = createRuntime();
    run.set({ impulseQ: { config: { retain: true } } } as Record<
      string,
      unknown
    >);
    const payload = new Date(0);
    run.impulse({ signals: ["a"], livePayload: payload } as Record<
      string,
      unknown
    >);

    const snap = run.get("impulseQ", { as: "snapshot" }) as {
      q: { entries: Array<{ livePayload?: unknown }> };
    };

    expect(snap.q.entries[0]!.livePayload).toBe(payload);
  });

  it("A1k — hydration must clear trimPendingMaxBytes (no post-hydration stack-exit trim)", () => {
    const run = createRuntime();
    run.set({ impulseQ: { config: { retain: true } } } as Record<
      string,
      unknown
    >);
    run.impulse({ signals: ["a"] } as Record<string, unknown>);
    run.impulse({ signals: ["b"] } as Record<string, unknown>);
    run.impulse({ signals: ["c"] } as Record<string, unknown>);

    let hydrated = false;
    run.onDiagnostic(() => {
      if (hydrated) {
        return;
      }

      hydrated = true;
      const s = run.get("*", { as: "snapshot" }) as {
        impulseQ: {
          config: { retain: number | boolean; maxBytes: number };
        };
      };
      s.impulseQ.config.retain = 0;
      s.impulseQ.config.maxBytes = Number.POSITIVE_INFINITY;
      run.set(s as unknown as Record<string, unknown>);
    });

    run.set({
      impulseQ: {
        config: {
          retain: 1,
          maxBytes: 0,
          onTrim: () => {
            throw new Error("boom");
          },
        },
      },
    } as Record<string, unknown>);

    const after = run.get("impulseQ" as string | undefined, {
      as: "snapshot",
    }) as { q: { cursor: number } };

    expect(after.q.cursor).toBe(1);
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
      scopeProjectionBaseline: {
        flags: { list: [], map: {} },
        changedFlags: undefined,
        seenFlags: { list: [], map: {} },
        signal: undefined,
        seenSignals: { list: [], map: {} },
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
      registeredById: {},
      diagnostics: [],
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
    const starUnscoped = run.get("*" as string | undefined, {
      as: "snapshot",
    });
    expect(run.get("*" as string | undefined, { scope: "applied" })).toEqual(
      starUnscoped,
    );
    expect(
      run.get("*" as string | undefined, { scope: "pendingOnly" }),
    ).toEqual(starUnscoped);
  });

  it("A2b — scoped get('*') must be trim-safe and side-effect free (Spec §4.1, §4.3)", () => {
    const run = createRuntime();
    const trims: Array<{ reason: string }> = [];

    run.set({ impulseQ: { config: { retain: true } } });
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
    expect(projected).toEqual(
      run.get("*" as string | undefined, { as: "snapshot" }),
    );
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
      scopeProjectionBaseline: {
        flags: { list: [], map: {} },
        changedFlags: undefined,
        seenFlags: { list: [], map: {} },
        signal: undefined,
        seenSignals: { list: [], map: {} },
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
      registeredById: {},
      diagnostics: [],
    });

    const scoped = run.get("*" as string | undefined, {
      scope: "applied",
      as: "snapshot",
    });

    expect(scoped).toEqual(
      run.get("*" as string | undefined, { as: "snapshot" }),
    );
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
      scopeProjectionBaseline: {
        flags: { list: [], map: {} },
        changedFlags: undefined,
        seenFlags: { list: [], map: {} },
        signal: undefined,
        seenSignals: { list: [], map: {} },
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
      registeredById: {},
      diagnostics: [],
    });

    const scoped = run.get("*" as string | undefined, {
      scope: "pending",
      as: "snapshot",
    });

    expect(scoped).toEqual(
      run.get("*" as string | undefined, { as: "snapshot" }),
    );
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
      scopeProjectionBaseline: {
        flags: { list: [], map: {} },
        changedFlags: undefined,
        seenFlags: { list: [], map: {} },
        signal: undefined,
        seenSignals: { list: [], map: {} },
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
      registeredById: {},
      diagnostics: [],
    });

    const scoped = run.get("*" as string | undefined, {
      scope: "pendingOnly",
      as: "snapshot",
    });

    expect(scoped).toEqual(
      run.get("*" as string | undefined, { as: "snapshot" }),
    );
  });

  it("A2.4 — get without scope must not execute scope projection path (Spec §4.1)", () => {
    const run = createRuntime();

    const entry = {
      signals: [] as string[],
      addFlags: [] as string[],
      removeFlags: [] as string[],
      useFixedFlags: false,
    };

    const scopeProjectionBaseline = {
      changedFlags: undefined,
      seenFlags: { list: [], map: {} },
      signal: undefined,
      seenSignals: { list: [], map: {} },
    };
    Object.defineProperty(scopeProjectionBaseline, "flags", {
      enumerable: true,
      configurable: true,
      get: () => {
        throw new Error("projection.path.should.not.run");
      },
    });

    run.set({
      defaults: run.get("defaults" as string | undefined, {
        as: "snapshot",
      }) as Record<string, unknown>,
      flags: { list: [], map: {} },
      changedFlags: undefined,
      seenFlags: { list: [], map: {} },
      signal: undefined,
      seenSignals: { list: [], map: {} },
      scopeProjectionBaseline: scopeProjectionBaseline as unknown as {
        flags: { list: string[]; map: Record<string, true> };
        changedFlags?: { list: string[]; map: Record<string, true> };
        seenFlags: { list: string[]; map: Record<string, true> };
        signal?: string;
        seenSignals: { list: string[]; map: Record<string, true> };
      },
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
      registeredById: {},
      diagnostics: [],
    });

    expect(() => run.get("flags" as string | undefined)).not.toThrow();
    expect(() =>
      run.get("flags" as string | undefined, { scope: "applied" }),
    ).toThrow("projection.path.should.not.run");
  });

  it("A2.5 — scope applied projection preserves state across trim via baseline (Spec §2.11.3, §4.1)", () => {
    const run = createRuntime();

    run.set({ impulseQ: { config: { retain: true } } });
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
    });

    expect(scopedStar).toEqual(
      run.get("*" as string | undefined, { as: "snapshot" }),
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
      scopeProjectionBaseline: {
        flags: { list: [], map: {} },
        changedFlags: undefined,
        seenFlags: { list: [], map: {} },
        signal: undefined,
        seenSignals: { list: [], map: {} },
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
      registeredById: {},
      diagnostics: [],
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
      list: ["c"],
      map: { c: true },
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
      scopeProjectionBaseline: {
        flags: { list: [], map: {} },
        changedFlags: undefined,
        seenFlags: { list: [], map: {} },
        signal: undefined,
        seenSignals: { list: [], map: {} },
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
      registeredById: {},
      diagnostics: [],
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
      list: ["d"],
      map: { d: true },
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
    run.set({ impulseQ: { config: { retain: true } } });
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

    const missingKeyCodes: string[] = [];
    run.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "set.hydration.incomplete") {
        missingKeyCodes.push(diagnostic.code);
      }
    });

    for (const key of Object.keys(snapshot)) {
      if (key === "backfillQ") {
        continue;
      }

      const incomplete = { ...snapshot };
      delete incomplete[key as keyof typeof incomplete];
      expect(() => run.set(incomplete)).toThrow("set.hydration.incomplete");
    }

    expect(missingKeyCodes).toHaveLength(Object.keys(snapshot).length - 1);
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
      backfillQ: { list: [], map: {} },
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
    ).toThrow("set.impulseQ.qForbidden");
  });

  it("B5.1 — run.impulse applies retain trim after drain (default retain=0)", () => {
    const run = createRuntime();

    run.set({ impulseQ: { config: { retain: 0 } } });
    run.impulse({ signals: ["sig:x"], addFlags: ["a"] });

    const impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      q: { entries: unknown[]; cursor: number };
    };

    expect(impulseQ.q.cursor).toBe(0);
    expect(impulseQ.q.entries.slice(0, impulseQ.q.cursor)).toEqual([]);
    expect(impulseQ.q.entries.slice(impulseQ.q.cursor)).toEqual([]);
  });

  it("B5.2 — get('impulseQ') returns canonical config values", () => {
    const run = createRuntime();

    run.set({ impulseQ: { config: { retain: true } } });
    let impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      config: { retain: number; maxBytes: number };
    };
    expect(impulseQ.config.retain).toBe(Number.POSITIVE_INFINITY);
    expect(impulseQ.config.maxBytes).toBe(Number.POSITIVE_INFINITY);

    run.set({ impulseQ: { config: { retain: false } } });
    impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      config: { retain: number; maxBytes: number };
    };
    expect(impulseQ.config.retain).toBe(0);
    expect(impulseQ.config.maxBytes).toBe(Number.POSITIVE_INFINITY);

    run.set({ impulseQ: { config: { retain: -3, maxBytes: -2 } } });
    impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      config: { retain: number; maxBytes: number };
    };
    expect(impulseQ.config.retain).toBe(0);
    expect(impulseQ.config.maxBytes).toBe(0);
  });

  it("B6 — signals patch updates signal/seenSignals without queue processing (Spec §4.2)", () => {
    const run = createRuntime();

    run.impulse({ signals: ["a"], addFlags: ["a"] });

    const beforeQ = run.get("impulseQ", { as: "snapshot" }) as {
      q: { cursor: number; entries: unknown[] };
    };

    run.set({ signals: ["patch-1", "patch-2"] });

    expect(run.get("signal")).toBe("patch-2");
    expect(run.get("seenSignals")).toEqual({
      list: ["a", "patch-1", "patch-2"],
      map: { a: true, "patch-1": true, "patch-2": true },
    });

    const afterQ = run.get("impulseQ", { as: "snapshot" }) as {
      q: { cursor: number; entries: unknown[] };
    };

    expect(afterQ.q.cursor).toBe(beforeQ.q.cursor);
    expect(afterQ.q.entries).toEqual(beforeQ.q.entries);
  });

  it("B7 — signals patch rejects invalid payloads (Spec §4.2)", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ signals: ["ok", 1] as unknown as string[] }),
    ).toThrow("set.signals.invalid");
    expect(codes).toContain("set.signals.invalid");
  });

  it("B8 — add/remove overlap throws and emits set.flags.addRemoveConflict", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() => run.set({ addFlags: ["x", "y"], removeFlags: ["y"] })).toThrow(
      "set.flags.addRemoveConflict",
    );
    expect(codes).toContain("set.flags.addRemoveConflict");
  });

  it("B9 — seenFlags extends by removeFlags input even when truth no longer contains flag", () => {
    const run = createRuntime();

    run.set({ flags: { list: ["a"], map: { a: true } } });
    run.set({ removeFlags: ["a"] });

    expect(run.get("flags", { as: "snapshot" })).toEqual({
      list: [],
      map: {},
    });
    expect(run.get("seenFlags", { as: "snapshot" })).toEqual({
      list: ["a"],
      map: { a: true },
    });
  });

  it("B10 — numeric-like flags remain stable with remove/re-add and delta ordering", () => {
    const run = createRuntime();

    run.set({ addFlags: ["2", "1", "10"] });
    run.set({ removeFlags: ["1"] });
    run.set({ addFlags: ["1"] });

    expect(run.get("flags", { as: "snapshot" })).toEqual({
      list: ["2", "10", "1"],
      map: { "1": true, "2": true, "10": true },
    });
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
      scopeProjectionBaseline: {
        flags: { list: [], map: {} },
        changedFlags: undefined,
        seenFlags: { list: [], map: {} },
        signal: undefined,
        seenSignals: { list: [], map: {} },
      },
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
      registeredById: {},
      diagnostics: [],
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

    expect(star).toEqual(run.get("*", { as: "snapshot" }));
  });

  it("A2.pendingOnly.trim-regression — pendingOnly ignores baseline seed after trim", () => {
    const run = createRuntime();

    run.impulse({ signals: ["applied"], addFlags: ["a"] });

    const hydration = run.get("*", { as: "snapshot" }) as {
      impulseQ: {
        q: { entries: Array<Record<string, unknown>>; cursor: number };
      };
    } & Record<string, unknown>;

    hydration.impulseQ.q.entries = [
      { signals: ["applied"], addFlags: ["a"], removeFlags: [] },
      { signals: ["pending"], addFlags: ["b"], removeFlags: [] },
    ];
    hydration.impulseQ.q.cursor = 1;
    run.set(hydration);

    run.set({ impulseQ: { config: { retain: 0 } } });

    expect(run.get("flags", { scope: "pendingOnly", as: "snapshot" })).toEqual({
      list: ["b"],
      map: { b: true },
    });
  });

  it("A2.hydration.trim — snapshot roundtrip preserves scoped projections after trim", () => {
    const run = createRuntime();

    run.impulse({ signals: ["applied-a"], addFlags: ["a"] });
    run.impulse({ signals: ["applied-b"], addFlags: ["b"] });
    run.impulse({ signals: ["pending-c"], addFlags: ["c"] });

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

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;

    const rehydrated = createRuntime();
    rehydrated.set(snapshot);

    expect(
      rehydrated.get("flags", { scope: "applied", as: "snapshot" }),
    ).toEqual(run.get("flags", { scope: "applied", as: "snapshot" }));
    expect(
      rehydrated.get("flags", { scope: "pending", as: "snapshot" }),
    ).toEqual(run.get("flags", { scope: "pending", as: "snapshot" }));
    expect(
      rehydrated.get("flags", { scope: "pendingOnly", as: "snapshot" }),
    ).toEqual(run.get("flags", { scope: "pendingOnly", as: "snapshot" }));
  });

  it("A9 — get('*') snapshot only contains hydration keys", () => {
    const run = createRuntime();
    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;

    expect(Object.keys(snapshot).sort()).toEqual([
      "backfillQ",
      "changedFlags",
      "defaults",
      "flags",
      "impulseQ",
      "seenFlags",
      "seenSignals",
      "signal",
    ]);
  });

  it("A10 — get(as:'reference') returns live unsafe reference", () => {
    const run = createRuntime();
    const flagsRef = run.get("flags", { as: "reference" }) as {
      list: string[];
      map: Record<string, true>;
    };

    flagsRef.map.injected = true;
    expect(
      (run.get("flags", { as: "reference" }) as { map: Record<string, true> })
        .map.injected,
    ).toBe(true);

    run.impulse({ addFlags: ["x"] });
    expect((run.get("flags") as { list: string[] }).list).toContain("x");
  });

  it("A11 — hydration reports unresolved backfill ids and drops them", () => {
    const run = createRuntime();
    run.set({
      defaults: run.get("defaults", { as: "snapshot" }) as Record<
        string,
        unknown
      >,
      flags: run.get("flags", { as: "snapshot" }) as Record<string, unknown>,
      changedFlags: run.get("changedFlags", { as: "snapshot" }) as
        | Record<string, unknown>
        | undefined,
      seenFlags: run.get("seenFlags", { as: "snapshot" }) as Record<
        string,
        unknown
      >,
      signal: run.get("signal", { as: "snapshot" }) as string | undefined,
      seenSignals: run.get("seenSignals", { as: "snapshot" }) as Record<
        string,
        unknown
      >,
      impulseQ: run.get("impulseQ", { as: "snapshot" }) as Record<
        string,
        unknown
      >,
      backfillQ: { list: ["missing:expr"], map: { "missing:expr": true } },
    });

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
      data?: Record<string, unknown>;
    }>;
    expect(
      diagnostics.some(
        (d) =>
          d.code === "runtime.onError.report" &&
          d.data?.phase === "set/hydration/backfillQ" &&
          d.data?.regExpressionId === "missing:expr",
      ),
    ).toBe(true);
    expect(run.get("backfillQ", { as: "snapshot" })).toEqual({
      list: [],
      map: {},
    });
  });

  it("A12 — hydration roundtrip is structurally stable", () => {
    const run = createRuntime();

    run.impulse({ signals: ["sig:1"], addFlags: ["1", "2", "10"] });
    run.impulse({ signals: ["sig:2"], removeFlags: ["2"], addFlags: ["2"] });
    run.set({ impulseQ: { config: { retain: 1 } } });

    const snapshotA = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;

    expect(Object.keys(snapshotA).sort()).toEqual([
      "backfillQ",
      "changedFlags",
      "defaults",
      "flags",
      "impulseQ",
      "seenFlags",
      "seenSignals",
      "signal",
    ]);

    const registeredByIdBefore = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    const registeredByIdBeforeEntries = [
      ...registeredByIdBefore.entries(),
    ].sort(([left], [right]) => left.localeCompare(right));
    const scopeProjectionBaselineBefore = run.get("scopeProjectionBaseline", {
      as: "snapshot",
    });

    run.set(snapshotA);

    const snapshotB = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;

    const registeredByIdAfter = run.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    const registeredByIdAfterEntries = [...registeredByIdAfter.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    );

    expect(snapshotB).toEqual(snapshotA);
    expect(snapshotB.impulseQ).toEqual(snapshotA.impulseQ);
    expect(registeredByIdAfterEntries).toEqual(registeredByIdBeforeEntries);
    expect(
      run.get("scopeProjectionBaseline", {
        as: "snapshot",
      }),
    ).toEqual(scopeProjectionBaselineBefore);
  });
});
