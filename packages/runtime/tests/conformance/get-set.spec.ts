/**
 * @file packages/runtime/tests/conformance/get-set.spec.ts
 * @version 0.12.0
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

type ScopeProjectionBaselineSnapshot = {
  flags: { list: string[]; map: Record<string, boolean> };
  changedFlags: unknown;
  seenFlags: { list: string[]; map: Record<string, boolean> };
  signal: string | undefined;
  seenSignals: { list: string[]; map: Record<string, boolean> };
};

describe("conformance/get-set", () => {
  it("A1 — get(unknown) must throw (Spec §4.1)", () => {
    const run = createRuntime();
    expect(() => run.get("unknown-key" as string | undefined)).toThrow(
      "get.key.invalid",
    );
  });

  it("A1x — snapshot get does not leak null-proto flag maps by reference", () => {
    const run = createRuntime();

    run.impulse({ addFlags: ["a"] });

    const snap1 = run.get("flags", { as: "snapshot" }) as {
      map: Record<string, true>;
      list: string[];
    };
    (snap1.map as Record<string, true | undefined>).evil = true;

    const snap2 = run.get("flags", { as: "snapshot" }) as {
      map: Record<string, true>;
      list: string[];
    };

    expect(snap2.map).not.toHaveProperty("evil");
    expect(snap2.list).toEqual(["a"]);
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

  it("A1f — hydration flags.list must reject duplicates", () => {
    const run = createRuntime();
    run.set({ flags: { list: ["x"], map: { x: true } } } as never);

    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;
    s.flags = { list: ["x", "x"], map: { x: true } };

    expect(() => run.set(s)).toThrow("set.hydration.flagsViewInvalid");
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
    const payload = new (class Payload {
      readonly value = 0;
    })();
    run.impulse({ signals: ["a"], livePayload: payload } as Record<
      string,
      unknown
    >);

    const snap = run.get("impulseQ", { as: "snapshot" }) as {
      q: { entries: Array<{ livePayload?: unknown }> };
    };

    expect(snap.q.entries[0]!.livePayload).toBe(payload);
  });

  it('A1m — defaults.methods is settable and visible via get("defaults")', () => {
    const run = createRuntime();

    run.set({
      defaults: { methods: { on: { runs: { max: 2 } } } },
    } as unknown as Record<string, unknown>);

    const d = run.get("defaults") as {
      methods: {
        on: { runs?: { max?: number } };
        when: Record<string, unknown>;
      };
    };
    expect(d.methods.on.runs?.max).toBe(2);
    expect(typeof d.methods.when).toBe("object");
  });

  it("A1n — run.on overlays runs.max from defaults.methods.on", () => {
    const run = createRuntime();
    run.set({
      defaults: { methods: { on: { runs: { max: 1 } } } },
    } as unknown as Record<string, unknown>);

    run.on({
      signal: "x",
      runs: { max: 999 },
      target: () => {},
    } as Record<string, unknown>);

    const first = [
      ...(
        run.get("registeredById") as Map<
          string,
          { signal?: string; runs?: { max?: number } }
        >
      ).values(),
    ].find((entry) => entry?.signal === "x");
    expect(first?.runs?.max).toBe(999);

    run.on({ signal: "y", target: () => {} } as Record<string, unknown>);

    const second = [
      ...(
        run.get("registeredById") as Map<
          string,
          { signal?: string; runs?: { max?: number } }
        >
      ).values(),
    ].find((entry) => entry?.signal === "y");
    expect(second?.runs?.max).toBe(1);
  });

  it("A1o — run.when overlays backfill.signal.runs.max from defaults.methods.when", () => {
    const run = createRuntime();
    run.set({
      defaults: {
        methods: {
          when: { backfill: { signal: { runs: { max: 3 } } } },
        },
      },
    } as unknown as Record<string, unknown>);

    run.when({
      signal: "z",
      target: () => {},
      backfill: { signal: { debt: 1 } },
    } as Record<string, unknown>);

    const expression = [
      ...(
        run.get("registeredById") as Map<
          string,
          {
            signal?: string;
            backfill?: { signal?: { runs?: { max?: number } } };
          }
        >
      ).values(),
    ].find((entry) => entry?.signal === "z");
    expect(expression?.backfill?.signal?.runs?.max).toBe(3);
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
    expect(impulseQ.q.entries[0]?.livePayload).not.toBe(livePayload);
    expect(impulseQ.q.entries[0]?.livePayload?.fn).toBe(livePayload.fn);
    expect(impulseQ.q.entries[0]?.livePayload?.node).not.toBe(livePayload);
    expect(impulseQ.q.entries[0]?.livePayload?.node).not.toBe(
      impulseQ.q.entries[0]?.livePayload,
    );
    expect(
      (
        impulseQ.q.entries[0]?.livePayload?.node as {
          node?: unknown;
        }
      )?.node,
    ).toBe(impulseQ.q.entries[0]?.livePayload?.node);
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
    ).toThrow("set.impulseQ.qForbidden");

    // unknown keys must be rejected (should throw per spec)
    expect(() =>
      run.set({ totallyUnknownKey: 123 } as Record<string, unknown>),
    ).toThrow("set.patch.forbidden");
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

    const requiredKeys = [
      "defaults",
      "flags",
      "changedFlags",
      "seenFlags",
      "signal",
      "seenSignals",
      "impulseQ",
    ];

    for (const key of requiredKeys) {
      const incomplete = { ...snapshot };
      delete incomplete[key as keyof typeof incomplete];
      expect(() => run.set(incomplete)).toThrow("set.hydration.incomplete");
    }

    expect(missingKeyCodes).toHaveLength(requiredKeys.length);
  });

  it("B4 — patch must reject changedFlags and preserve hydration changedFlags (Spec §4.2)", () => {
    const run = createRuntime();

    expect(() =>
      run.set({ changedFlags: { list: ["x"], map: { x: true } } }),
    ).toThrow("set.patch.forbidden");

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

    run.set({ impulseQ: { config: { retain: -3.9, maxBytes: -2.2 } } });
    impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      config: { retain: number; maxBytes: number };
    };
    expect(impulseQ.config.retain).toBe(0);
    expect(impulseQ.config.maxBytes).toBe(0);

    run.set({ impulseQ: { config: { retain: 4.8, maxBytes: 7.9 } } });
    impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      config: { retain: number; maxBytes: number };
    };
    expect(impulseQ.config.retain).toBe(4);
    expect(impulseQ.config.maxBytes).toBe(7);

    run.set({
      impulseQ: {
        config: {
          retain: Number.POSITIVE_INFINITY,
          maxBytes: Number.POSITIVE_INFINITY,
        },
      },
    });
    impulseQ = run.get("impulseQ", { as: "snapshot" }) as {
      config: { retain: number; maxBytes: number };
    };
    expect(impulseQ.config.retain).toBe(Number.POSITIVE_INFINITY);
    expect(impulseQ.config.maxBytes).toBe(Number.POSITIVE_INFINITY);
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

    const keys = Object.keys(snapshot).sort();
    for (const key of [
      "defaults",
      "flags",
      "changedFlags",
      "seenFlags",
      "signal",
      "seenSignals",
      "impulseQ",
      "backfillQ",
      "scopeProjectionBaseline",
      "registeredById",
      "registeredQ",
      "diagnostics",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('STAR-01 — get("*", { as:"snapshot" }) contains full hydration surface', () => {
    const run = createRuntime();

    run.when({ signal: "s", targets: [() => undefined] } as never);
    try {
      run.add({
        id: 123 as never,
        signal: "s",
        targets: [() => undefined],
      } as never);
    } catch {
      // expected
    }

    const star = run.get("*", { as: "snapshot" }) as {
      scopeProjectionBaseline: { flags: { list: string[] } };
      registeredById: Map<string, unknown>;
      registeredQ: unknown[];
      diagnostics: unknown[];
    };

    expect(star.scopeProjectionBaseline).toBeTruthy();
    expect(star.registeredById).toBeInstanceOf(Map);
    expect(star.registeredQ).toBeInstanceOf(Array);
    expect(star.diagnostics).toBeInstanceOf(Array);
  });

  it('STAR-02 — hydration roundtrip via get("*") works without manual extras', () => {
    const run = createRuntime();
    run.when({ signal: "s", targets: [() => undefined] } as never);
    expect(() =>
      run.add({
        id: 123 as never,
        signal: "s",
        targets: [() => undefined],
      } as never),
    ).toThrow("add.id.invalid");
    expect(() =>
      run.add({ id: "bad", signal: "", targets: [() => undefined] } as never),
    ).toThrow("add.signals.invalid");

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;

    const rehydrated = createRuntime();
    rehydrated.set(snapshot);

    const base2 = rehydrated.get("scopeProjectionBaseline", {
      as: "snapshot",
    }) as {
      flags: { list: string[]; map: Record<string, boolean> };
    };
    expect(Array.isArray(base2.flags.list)).toBe(true);

    const byId = rehydrated.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;
    expect(byId).toBeInstanceOf(Map);

    const diagnostics = rehydrated.get("diagnostics", {
      as: "snapshot",
    }) as Array<{ code?: string }>;
    expect(Array.isArray(diagnostics)).toBe(true);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics.some((d) => d.code === "add.id.invalid")).toBe(true);
    expect(diagnostics.some((d) => d.code === "add.signals.invalid")).toBe(
      true,
    );

    const registeredQ = rehydrated.get("registeredQ", {
      as: "snapshot",
    }) as unknown[];
    expect(Array.isArray(registeredQ)).toBe(true);
    expect(registeredQ.length).toBeGreaterThan(0);
  });

  it('STAR-03 — backfillQ roundtrips via get("*") snapshot hydration', () => {
    const run = createRuntime();

    run.when({ signal: "s", targets: [() => undefined] } as never);
    run.when({ signal: "s", targets: [() => undefined] } as never);

    const h = run.get("*", { as: "snapshot" }) as {
      backfillQ?: unknown;
    };
    expect(h.backfillQ).toBeTruthy();

    const rehydrated = createRuntime();
    rehydrated.set(h as never);

    const b1 = run.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };
    const b2 = rehydrated.get("backfillQ", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, true>;
    };

    expect(b2).toBeTruthy();
    expect(Array.isArray(b2.list)).toBe(true);
    expect(typeof b2.map).toBe("object");

    expect(b2.list.length).toBe(b1.list.length);
    expect(Object.keys(b2.map).sort()).toEqual(Object.keys(b1.map).sort());

    if (b1.list.length === 0) {
      expect(b2.list.length).toBe(0);
    }
  });

  it("STAR-04 — registeredById id set matches registeredQ after roundtrip", () => {
    const run = createRuntime();
    run.when({ id: "star:04", signal: "s", targets: [() => undefined] });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const rehydrated = createRuntime();
    rehydrated.set(snapshot);

    const q = rehydrated.get("registeredQ", { as: "snapshot" }) as Array<{
      id: string;
    }>;
    const byId = rehydrated.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;

    expect(byId.size).toBe(q.length);
    for (const e of q) {
      expect(byId.has(e.id)).toBe(true);
    }
  });

  it("STAR-05 — diagnostics are cloned objects on hydration roundtrip", () => {
    const run = createRuntime();
    expect(() =>
      run.add({ id: 123 as never, signal: "s", targets: [() => undefined] }),
    ).toThrow("add.id.invalid");

    const snap = run.get("*", { as: "snapshot" }) as {
      diagnostics: Array<{ code: string; data?: unknown }>;
    };
    const rehydrated = createRuntime();
    rehydrated.set(snap as never);

    const d1 = snap.diagnostics[0]!;
    const d2 = (
      rehydrated.get("diagnostics", { as: "snapshot" }) as Array<{
        code: string;
        data?: unknown;
      }>
    )[0]!;

    expect(d2).not.toBe(d1);
    expect(d2.code).toBe(d1.code);
    expect(d2).toEqual(d1);
    if (typeof d1.data === "object" && d1.data !== null) {
      expect(d2.data).not.toBe(d1.data);
    }
  });

  it("DIAG-REF-01 — diagnostics reference reflects shrink (no stale cache)", () => {
    const run = createRuntime();

    try {
      run.add({
        id: 123 as never,
        signal: "s",
        targets: [() => undefined],
      } as never);
    } catch {
      // expected
    }
    try {
      run.add({
        id: "ok",
        signal: "" as never,
        targets: [() => undefined],
      } as never);
    } catch {
      // expected
    }

    const r1 = run.get("diagnostics", { as: "reference" }) as unknown[];
    expect(r1.length).toBeGreaterThanOrEqual(2);

    const snap = run.get("*", { as: "snapshot" }) as {
      diagnostics: unknown[];
    };
    snap.diagnostics = [];

    const rehydrated = createRuntime();
    rehydrated.set(snap);

    const r2 = rehydrated.get("diagnostics", { as: "reference" }) as unknown[];
    expect(r2.length).toBe(0);
  });

  it("DIAG-REF-02 — diagnostics reference updates on same-length rebuild (no stale objects)", () => {
    const run = createRuntime();

    try {
      run.add({
        id: 123 as never,
        signal: "s",
        targets: [() => undefined],
      } as never);
    } catch {
      // expected
    }
    try {
      run.add({
        id: "ok",
        signal: "" as never,
        targets: [() => undefined],
      } as never);
    } catch {
      // expected
    }

    const snap = run.get("*", { as: "snapshot" }) as {
      diagnostics: unknown[];
    };

    const rehydrated = createRuntime();
    rehydrated.set(snap);

    const r1 = rehydrated.get("diagnostics", { as: "reference" }) as unknown[];
    expect(r1.length).toBe(snap.diagnostics.length);
    const old0 = r1[0];

    rehydrated.set(snap);

    const r2 = rehydrated.get("diagnostics", { as: "reference" }) as unknown[];
    expect(r2).not.toBe(r1);
    if (r2.length > 0) {
      expect(r2[0]).not.toBe(old0);
    }
  });

  it("STAR-06 — hydration ignores provided registeredById and rebuilds from registeredQ", () => {
    const run = createRuntime();
    run.when({ signal: "s", targets: [() => undefined] } as never);
    run.when({ signal: "s", targets: [() => undefined] } as never);

    const snap = run.get("*", { as: "snapshot" }) as Record<string, unknown>;
    snap.registeredQ = run.get("registeredQ", { as: "snapshot" });
    snap.registeredById = run.get("registeredById", { as: "snapshot" });

    snap.registeredById = new Map([["__bad__", { id: "__bad__" }]]);

    const rehydrated = createRuntime();
    rehydrated.set(snap);

    const q = rehydrated.get("registeredQ", { as: "snapshot" }) as Array<{
      id: string;
    }>;
    const byId = rehydrated.get("registeredById", {
      as: "snapshot",
    }) as Map<string, unknown>;

    expect(byId.has("__bad__")).toBe(false);
    expect(byId.size).toBe(q.length);
    for (const e of q) expect(byId.has(e.id)).toBe(true);
  });

  it("STAR-07 — hydration replaces diagnostics with snapshot diagnostics (no merge)", () => {
    const run = createRuntime();

    try {
      run.add({
        id: 123 as never,
        signal: "s",
        targets: [() => undefined],
      } as never);
    } catch (error) {
      void error;
    }
    try {
      run.add({
        id: "ok",
        signal: "" as never,
        targets: [() => undefined],
      } as never);
    } catch (error) {
      void error;
    }

    const snap = run.get("*", { as: "snapshot" }) as {
      diagnostics: Array<{ code: string }>;
    };
    snap.diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
    }>;

    const rehydrated = createRuntime();
    try {
      rehydrated.add({
        id: 123 as never,
        signal: "s",
        targets: [() => undefined],
      } as never);
    } catch (error) {
      void error;
    }

    rehydrated.set(snap);

    const d = rehydrated.get("diagnostics", { as: "snapshot" }) as Array<{
      code?: string;
    }>;
    expect(d.some((x) => x.code === "add.id.invalid")).toBe(true);
    expect(d.some((x) => x.code === "add.signals.invalid")).toBe(true);

    expect(d.map((x) => x.code)).toEqual(
      (snap.diagnostics as Array<{ code?: string }>).map((x) => x.code),
    );
  });

  it("REF-READONLY-01 — reference prevents nested array/object mutations", () => {
    const run = createRuntime();

    run.set({ flags: { list: ["a"], map: { a: true } } } as never);

    const ref = run.get("flags", { as: "reference" }) as {
      list: string[];
      map: Record<string, boolean>;
    };

    expect(() => {
      ref.list[0] = "x";
    }).toThrow("runtime.readonly");
    expect(() => {
      ref.list.push("b");
    }).toThrow("runtime.readonly");
    expect(() => {
      ref.map.a = false;
    }).toThrow("runtime.readonly");
  });

  it("REF-VIEW-02 — reference on safe kind is a borrowed view (no snapshot)", () => {
    const run = createRuntime({ allowUnsafeAlias: true });
    const events: Array<{ code: string }> = [];
    run.onDiagnostic((d) => events.push({ code: d.code }));

    run.set({ flags: { list: ["a"], map: { a: true } } } as never);

    const ref = run.get("flags", { as: "reference" }) as {
      list: string[];
      map: Record<string, boolean>;
    };
    const alias = run.get("flags", { as: "unsafeAlias" }) as {
      list: string[];
      map: Record<string, boolean>;
    };

    alias.list.push("b");
    alias.map.b = true;

    expect(ref.list).toContain("b");
    expect(ref.map.b).toBe(true);

    expect(() => ref.list.push("x")).toThrow("runtime.readonly");
    expect(() => {
      ref.map.x = true;
    }).toThrow("runtime.readonly");

    expect(
      events.some((e) => e.code === "runtime.get.reference.fallbackSnapshot"),
    ).toBe(false);
  });

  it("REF-FALLBACK-02 — reference falls back to snapshot for opaque values and emits telemetry", () => {
    const run = createRuntime();
    const events: Array<{ code: string; data?: Record<string, unknown> }> = [];
    run.onDiagnostic((d) =>
      events.push({
        code: d.code,
        ...(d.data !== undefined
          ? { data: d.data as Record<string, unknown> }
          : {}),
      }),
    );

    run.when({ id: "opaque:map", signal: "s", targets: [() => undefined] });

    const ref = run.get("registeredById", { as: "reference" }) as Map<
      string,
      unknown
    >;

    expect(() => ref.set("x", {})).toThrow("runtime.readonly");

    const fallbackEvent = events.find(
      (e) => e.code === "runtime.get.reference.fallbackSnapshot",
    );
    expect(fallbackEvent?.data?.valueKind).toBe("Map");
    expect(
      typeof fallbackEvent?.data?.valueKind === "string" &&
        fallbackEvent.data.valueKind.length > 0,
    ).toBe(true);
  });

  it("REF-FALLBACK-03 — reference falls back when object is not proxy-wrappable", () => {
    const run = createRuntime({ allowUnsafeAlias: true });
    const events: Array<{ code: string; data?: Record<string, unknown> }> = [];
    run.onDiagnostic((d) =>
      events.push({
        code: d.code,
        ...(d.data !== undefined
          ? { data: d.data as Record<string, unknown> }
          : {}),
      }),
    );

    run.set({ flags: { list: [], map: {} } } as never);

    const inner = { x: 1 };
    const flagsAlias = run.get("flags", { as: "unsafeAlias" }) as {
      locked?: { x: number };
    };
    Object.defineProperty(flagsAlias, "locked", {
      value: inner,
      writable: false,
      configurable: false,
      enumerable: true,
    });

    const ref = run.get("flags", { as: "reference" }) as {
      locked: { x: number };
    };

    expect(() => {
      ref.locked.x = 2;
    }).toThrow("runtime.readonly");

    const fallbackEvent = events.find(
      (e) => e.code === "runtime.get.reference.fallbackSnapshot",
    );
    expect(fallbackEvent?.data?.valueKind).toBe("NonWrappableObject");
    expect(
      typeof fallbackEvent?.data?.valueKind === "string" &&
        fallbackEvent.data.valueKind.length > 0,
    ).toBe(true);

    expect(ref.locked).not.toBe(inner);
  });
  it("UNSAFE-ALIAS-03 — unsafeAlias aliases state when enabled", () => {
    const run = createRuntime({ allowUnsafeAlias: true });
    const events: Array<{ code: string }> = [];
    run.onDiagnostic((d) => events.push({ code: d.code }));

    run.set({ flags: { list: ["a"], map: { a: true } } } as never);

    const alias = run.get("flags", { as: "unsafeAlias" }) as {
      list: string[];
      map: Record<string, boolean>;
    };
    alias.list.push("b");
    alias.map.b = true;

    const snap = run.get("flags", { as: "snapshot" }) as {
      list: string[];
      map: Record<string, boolean>;
    };
    expect(snap.list).toEqual(["a", "b"]);
    expect(snap.map).toEqual({ a: true, b: true });
    expect(events.some((e) => e.code === "runtime.get.unsafeAlias.used")).toBe(
      true,
    );
  });

  it("UNSAFE-ALIAS-04 — unsafeAlias is forbidden by default in dev mode", () => {
    const run = createRuntime();
    const events: Array<{ code: string }> = [];
    run.onDiagnostic((d) => events.push({ code: d.code }));

    expect(() => run.get("flags", { as: "unsafeAlias" })).toThrow(
      "get.as.unsafeAlias.forbidden",
    );
    expect(events.some((e) => e.code === "get.as.unsafeAlias.forbidden")).toBe(
      true,
    );
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
      "diagnostics",
      "flags",
      "impulseQ",
      "registeredById",
      "registeredQ",
      "scopeProjectionBaseline",
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

  it("set(flags) lehnt non-string list items ab", () => {
    const run = createRuntime();

    expect(() =>
      run.set({ flags: { list: [1], map: { "1": true } } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.flags.invalid");
  });

  it("hydration backfillQ.list lehnt non-string ab", () => {
    const run = createRuntime();
    run.add({ id: "e1", targets: [() => {}] });

    const snap = run.get("*", { as: "snapshot" }) as Record<string, unknown> & {
      backfillQ?: unknown;
    };
    snap.backfillQ = { list: [1], map: { "1": true } };

    expect(() => run.set(snap)).toThrow("set.hydration.backfillQInvalid");
  });

  it("hydration backfillQ duplicates emit backfillQInvalid", () => {
    const run = createRuntime();
    const diagnostics: string[] = [];
    run.onDiagnostic((d) => diagnostics.push(d.code));

    run.add({ id: "e1", targets: [() => {}] });
    const snap = run.get("*", { as: "snapshot" }) as Record<string, unknown> & {
      backfillQ?: unknown;
    };
    snap.backfillQ = { list: ["e1", "e1"], map: { e1: true } };

    expect(() => run.set(snap)).toThrow("set.hydration.backfillQInvalid");
    expect(diagnostics).toContain("set.hydration.backfillQInvalid");
    expect(diagnostics).not.toContain("set.hydration.seenSignalsInvalid");
  });
});

describe("conformance/get-set/scope-projection", () => {
  type ScopeProjectionSnapshot = Record<string, unknown> & {
    impulseQ: {
      config: { retain: number; maxBytes: number };
      q: {
        cursor: number;
        entries: Array<{
          signals: string[];
          addFlags: string[];
          removeFlags: string[];
          useFixedFlags: boolean;
        }>;
      };
    };
  };

  type FlagsSnapshot = {
    list: string[];
    map: Record<string, true>;
  };

  it("SCOPE-01 — impulseQ scope semantics (pending ist applied+pending)", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as ScopeProjectionSnapshot;
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: {
        cursor: 1,
        entries: [
          {
            signals: ["sig:a"],
            addFlags: ["a"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["sig:b"],
            addFlags: ["b"],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };
    run.set(s);

    const pending = run.get("impulseQ", {
      scope: "pending",
      as: "snapshot",
    }) as ScopeProjectionSnapshot["impulseQ"];
    const q0 = pending.q;

    expect(run.get("impulseQ", { scope: "applied", as: "snapshot" })).toEqual({
      config: pending.config,
      q: { cursor: q0.cursor, entries: q0.entries.slice(0, q0.cursor) },
    });

    expect(
      run.get("impulseQ", { scope: "pendingOnly", as: "snapshot" }),
    ).toEqual({
      config: pending.config,
      q: { cursor: 0, entries: q0.entries.slice(q0.cursor) },
    });
  });

  it("SCOPE-02 — flags scope semantics (applied vs pending vs pendingOnly)", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as ScopeProjectionSnapshot;
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: {
        cursor: 1,
        entries: [
          {
            signals: ["sig:a"],
            addFlags: ["a"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["sig:b"],
            addFlags: ["b"],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };
    run.set(s);

    const applied = run.get("flags", {
      scope: "applied",
      as: "snapshot",
    }) as FlagsSnapshot;
    const pending = run.get("flags", {
      scope: "pending",
      as: "snapshot",
    }) as FlagsSnapshot;
    const pendingOnly = run.get("flags", {
      scope: "pendingOnly",
      as: "snapshot",
    }) as FlagsSnapshot;

    expect(applied.list).toEqual(["a"]);
    expect(pending.list).toEqual(["a", "b"]);
    expect(pendingOnly.list).toEqual(["b"]);

    expect(applied.map.a).toBe(true);
    expect(applied.map.b).toBeUndefined();
    expect(pending.map.a).toBe(true);
    expect(pending.map.b).toBe(true);
  });
});

describe("conformance/get-set/impulseQ-trim-maxBytes", () => {
  type ImpulseQTrimEntry = {
    signals?: string[];
  };

  type ImpulseQTrimSnapshot = {
    impulseQ: {
      config: {
        retain: number;
        maxBytes: number;
      };
      q: {
        cursor: number;
        entries: Array<{
          signals: string[];
          addFlags: string[];
          removeFlags: string[];
          useFixedFlags: boolean;
        }>;
      };
    };
  };

  it("TRM02 — maxBytes trims applied entries even when retain is high", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as ImpulseQTrimSnapshot;
    const big = "x".repeat(200);

    s.impulseQ = {
      config: {
        retain: 999,
        maxBytes: 120,
      },
      q: {
        cursor: 2,
        entries: [
          {
            signals: [big],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: [big],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    run.impulse();

    const q = (
      run.get("impulseQ", {
        as: "snapshot",
      }) as ImpulseQTrimSnapshot["impulseQ"]
    ).q;

    expect(q.cursor).toBeLessThan(2);
    expect(q.entries.length).toBeLessThan(2);
  });

  it("TRM03 — maxBytes trim must not drop pending entries", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as ImpulseQTrimSnapshot;
    const big = "x".repeat(200);

    s.impulseQ = {
      config: {
        retain: 999,
        maxBytes: 120,
      },
      q: {
        cursor: 1,
        entries: [
          {
            signals: [big],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["p"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    run.impulse();

    const q = (
      run.get("impulseQ", {
        as: "snapshot",
      }) as ImpulseQTrimSnapshot["impulseQ"]
    ).q;

    expect(
      q.entries.some((e: ImpulseQTrimEntry) => e.signals?.[0] === "p"),
    ).toBe(true);
    expect(q.cursor).toBeLessThanOrEqual(q.entries.length);
  });

  it("TRM04 — maxBytes removes oldest applied first (stable), keeps newest applied + pending", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as ImpulseQTrimSnapshot;
    const big = "x".repeat(200);
    const small = "y";

    s.impulseQ = {
      config: {
        retain: 999,
        maxBytes: 120,
      },
      q: {
        cursor: 2,
        entries: [
          {
            signals: [big],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: [small],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["p"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    run.impulse();

    const q = (
      run.get("impulseQ", {
        as: "snapshot",
      }) as ImpulseQTrimSnapshot["impulseQ"]
    ).q;

    expect(
      q.entries.some((e: ImpulseQTrimEntry) => e.signals?.[0] === "y"),
    ).toBe(true);
    expect(
      q.entries.some((e: ImpulseQTrimEntry) => e.signals?.[0] === "p"),
    ).toBe(true);
    expect(
      q.entries.some((e: ImpulseQTrimEntry) => e.signals?.[0] === big),
    ).toBe(false);
    expect(q.cursor).toBeLessThanOrEqual(1);
  });

  it("TRM05 — onTrim is called with reason=maxBytes and removed entries match what was removed", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as ImpulseQTrimSnapshot & {
      impulseQ: {
        config: ImpulseQTrimSnapshot["impulseQ"]["config"] & {
          onTrim?: (info: {
            entries: ImpulseQTrimEntry[];
            stats?: { reason?: string; bytesFreed?: number };
          }) => void;
        };
      };
    };
    const big = "x".repeat(200);
    const small = "y";
    const calls: Array<{
      entries: ImpulseQTrimEntry[];
      stats?: { reason?: string; bytesFreed?: number };
    }> = [];

    s.impulseQ = {
      config: {
        retain: 999,
        maxBytes: 120,
        onTrim: (info) => calls.push(info),
      },
      q: {
        cursor: 2,
        entries: [
          {
            signals: [big],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: [small],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s as unknown as Record<string, unknown>);

    run.impulse();

    const maxCalls = calls.filter((c) => c?.stats?.reason === "maxBytes");
    const maxCall = maxCalls[0];

    expect(maxCalls.length).toBe(1);
    expect(
      maxCall?.entries.some((e: ImpulseQTrimEntry) => e.signals?.[0] === big),
    ).toBe(true);
    expect(
      maxCall?.entries.some((e: ImpulseQTrimEntry) => e.signals?.[0] === small),
    ).toBe(false);
    expect(typeof maxCall?.stats?.bytesFreed).toBe("number");
  });
});

describe("conformance/get-set/scope-projection-baseline-after-set", () => {
  type FlagsListSnapshot = { list: string[] };

  it("BASE-01 — set(flagsTruth + impulseQ pending) must make scope projections consistent", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;

    s.flagsTruth = { list: ["a"], map: { a: true } };
    s.flags = { list: ["a"], map: { a: true } };
    const baseline = (
      s as { scopeProjectionBaseline: ScopeProjectionBaselineSnapshot }
    ).scopeProjectionBaseline;
    baseline.flags = { list: ["a"], map: { a: true } };
    baseline.changedFlags = undefined;
    baseline.seenFlags = { list: [], map: {} };
    baseline.signal = undefined;
    baseline.seenSignals = { list: [], map: {} };
    s.seenFlags = { list: [], map: {} };
    s.seenSignals = { list: [], map: {} };
    s.signal = undefined;
    s.changedFlags = undefined;
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: {
        cursor: 0,
        entries: [
          {
            signals: ["sig:p"],
            addFlags: ["b"],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    const applied = run.get("flags", {
      scope: "applied",
      as: "snapshot",
    }) as FlagsListSnapshot;
    const pending = run.get("flags", {
      scope: "pending",
      as: "snapshot",
    }) as FlagsListSnapshot;
    const pendingOnly = run.get("flags", {
      scope: "pendingOnly",
      as: "snapshot",
    }) as FlagsListSnapshot;

    expect(applied.list).toEqual(["a"]);
    expect(pending.list).toEqual(["a", "b"]);
    expect(pendingOnly.list).toEqual(["b"]);
  });

  it("BASE-02 — set(flagsTruth only) must not break scope projections (empty impulseQ)", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;

    s.flagsTruth = { list: ["a"], map: { a: true } };
    s.flags = { list: ["a"], map: { a: true } };
    const baseline = (
      s as { scopeProjectionBaseline: ScopeProjectionBaselineSnapshot }
    ).scopeProjectionBaseline;
    baseline.flags = { list: ["a"], map: { a: true } };
    baseline.changedFlags = undefined;
    baseline.seenFlags = { list: [], map: {} };
    baseline.signal = undefined;
    baseline.seenSignals = { list: [], map: {} };
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: { cursor: 0, entries: [] },
    };

    run.set(s);

    const applied = run.get("flags", {
      scope: "applied",
      as: "snapshot",
    }) as FlagsListSnapshot;
    const pending = run.get("flags", {
      scope: "pending",
      as: "snapshot",
    }) as FlagsListSnapshot;
    const pendingOnly = run.get("flags", {
      scope: "pendingOnly",
      as: "snapshot",
    }) as FlagsListSnapshot;

    expect(applied.list).toEqual(["a"]);
    expect(pending.list).toEqual(["a"]);
    expect(pendingOnly.list).toEqual([]);
  });
});

describe("conformance/get-set/scope-projection-signal-seenSignals", () => {
  it("SCOPE-03 — signal scope projection (applied vs pending vs pendingOnly)", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;

    s.signal = "base";
    s.seenSignals = { list: [], map: {} };
    s.seenFlags = { list: [], map: {} };
    s.flagsTruth = { list: [], map: {} };
    s.flags = { list: [], map: {} };
    const baseline = (
      s as { scopeProjectionBaseline: ScopeProjectionBaselineSnapshot }
    ).scopeProjectionBaseline;
    baseline.flags = { list: [], map: {} };
    baseline.changedFlags = undefined;
    baseline.seenFlags = { list: [], map: {} };
    baseline.signal = "base";
    baseline.seenSignals = { list: [], map: {} };
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: {
        cursor: 1,
        entries: [
          {
            signals: ["a1", "a2"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["b1"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    expect(run.get("signal", { scope: "applied", as: "snapshot" })).toBe("a2");
    expect(run.get("signal", { scope: "pending", as: "snapshot" })).toBe("b1");
    expect(run.get("signal", { scope: "pendingOnly", as: "snapshot" })).toBe(
      "b1",
    );
  });

  it("SCOPE-04 — signal projection when there is NO applied (cursor=0) preserves baseline for applied", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;

    s.signal = "base";
    s.seenSignals = { list: [], map: {} };
    s.seenFlags = { list: [], map: {} };
    s.flagsTruth = { list: [], map: {} };
    s.flags = { list: [], map: {} };
    const baseline = (
      s as { scopeProjectionBaseline: ScopeProjectionBaselineSnapshot }
    ).scopeProjectionBaseline;
    baseline.flags = { list: [], map: {} };
    baseline.changedFlags = undefined;
    baseline.seenFlags = { list: [], map: {} };
    baseline.signal = "base";
    baseline.seenSignals = { list: [], map: {} };
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: {
        cursor: 0,
        entries: [
          {
            signals: ["p1", "p2"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    expect(run.get("signal", { scope: "applied", as: "snapshot" })).toBe(
      "base",
    );
    expect(run.get("signal", { scope: "pending", as: "snapshot" })).toBe("p2");
    expect(run.get("signal", { scope: "pendingOnly", as: "snapshot" })).toBe(
      "p2",
    );
  });

  it("SCOPE-05 — seenSignals scope projection (stable-unique; applied vs pending vs pendingOnly)", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;

    s.seenSignals = { list: ["seed"], map: { seed: true } };
    s.signal = "seed";
    s.flagsTruth = { list: [], map: {} };
    s.flags = { list: [], map: {} };
    s.seenFlags = { list: [], map: {} };
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: {
        cursor: 1,
        entries: [
          {
            signals: ["seed", "a"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["a", "b"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    const applied = run.get("seenSignals", {
      scope: "applied",
      as: "snapshot",
    }) as { list: string[] };
    const pending = run.get("seenSignals", {
      scope: "pending",
      as: "snapshot",
    }) as { list: string[] };
    const pendingOnly = run.get("seenSignals", {
      scope: "pendingOnly",
      as: "snapshot",
    }) as { list: string[] };

    expect(applied.list).toEqual(["seed", "a"]);
    expect(pending.list).toEqual(["seed", "a", "b"]);
    // pendingOnly projiziert NUR pending-segment (cursor..end) und seeded leer
    expect(pendingOnly.list).toEqual(["a", "b"]);
  });

  it("SCOPE-06 — pendingOnly seeds empty/undefined when there is NO pending segment", () => {
    const run = createRuntime();
    const s = run.get("*", { as: "snapshot" }) as Record<string, unknown>;

    s.signal = "base";
    s.seenSignals = { list: ["seed"], map: { seed: true } };
    s.seenFlags = { list: [], map: {} };
    s.flagsTruth = { list: [], map: {} };
    s.flags = { list: [], map: {} };

    // cursor === entries.length -> no pending segment
    s.impulseQ = {
      config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
      q: {
        cursor: 1,
        entries: [
          {
            signals: ["a1"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    run.set(s);

    expect(run.get("signal", { scope: "pendingOnly", as: "snapshot" })).toBe(
      undefined,
    );

    const pendingOnly = run.get("seenSignals", {
      scope: "pendingOnly",
      as: "snapshot",
    }) as { list: string[] };

    expect(pendingOnly.list).toEqual([]);
  });
});
