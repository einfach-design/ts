import { describe, expect, it } from "vitest";

import { createRuntime } from "../../src/index.js";

describe("conformance/use-case-coverage/defaults", () => {
  it("A01 — run.when uses defaults.methods.when.runs.max", () => {
    const run = createRuntime();
    const calls: string[] = [];

    run.set({
      defaults: { methods: { when: { runs: { max: 2 } } } },
    } as Record<string, unknown>);

    const id = "expr:when:defaults:max2";
    run.when({
      id,
      flags: { xyz: false },
      targets: [() => calls.push("x")],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });

    expect(calls).toHaveLength(2);
    const registeredById = run.get("registeredById") as Map<string, unknown>;
    expect(registeredById.has(id)).toBe(false);
    const registeredQ = run.get("registeredQ", { as: "snapshot" }) as Array<{
      id: string;
      tombstone?: boolean;
    }>;
    expect(registeredQ.find((entry) => entry.id === id)?.tombstone).toBe(true);
  });

  it("A02 — explicit runs.max overrides defaults", () => {
    const run = createRuntime();
    let calls = 0;

    run.set({
      defaults: { methods: { when: { runs: { max: 2 } } } },
    } as Record<string, unknown>);

    const id = "expr:when:override:max1";
    run.when({
      id,
      runs: { max: 1 },
      flags: { xyz: false },
      targets: [() => calls++],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });

    expect(calls).toBe(1);
    expect((run.get("registeredById") as Map<string, unknown>).has(id)).toBe(
      false,
    );
  });

  it("A03 — defaults are not retroactive", () => {
    const run = createRuntime();
    let callsA = 0;
    let callsB = 0;

    run.set({
      defaults: { methods: { when: { runs: { max: 3 } } } },
    } as Record<string, unknown>);

    run.when({
      id: "expr:a",
      flags: { a: false },
      targets: [() => callsA++],
    } as Record<string, unknown>);

    run.set({
      defaults: { methods: { when: { runs: { max: 1 } } } },
    } as Record<string, unknown>);

    run.when({
      id: "expr:b",
      flags: { b: false },
      targets: [() => callsB++],
    } as Record<string, unknown>);

    const byId = run.get("registeredById") as Map<
      string,
      { runs?: { max?: number } }
    >;
    expect(byId.get("expr:a")?.runs?.max).toBe(3);
    expect(byId.get("expr:b")?.runs?.max).toBe(1);

    run.impulse({ addFlags: ["a"] });
    run.impulse({ removeFlags: ["a"] });
    run.impulse({ addFlags: ["a"] });
    run.impulse({ removeFlags: ["a"] });
    run.impulse({ addFlags: ["a"] });

    run.impulse({ addFlags: ["b"] });
    run.impulse({ removeFlags: ["b"] });
    run.impulse({ addFlags: ["b"] });

    expect(callsA).toBe(3);
    expect(callsB).toBe(1);
  });

  it("A04 — defaults deep merge keeps nested defaults", () => {
    const run = createRuntime();

    run.set({
      defaults: {
        methods: { when: { backfill: { signal: { runs: { max: 3 } } } } },
      },
    } as Record<string, unknown>);

    run.set({
      defaults: { methods: { when: { runs: { max: 2 } } } },
    } as Record<string, unknown>);

    const defaults = run.get("defaults", { as: "snapshot" }) as {
      methods: {
        when: {
          runs?: { max?: number };
          backfill?: { signal?: { runs?: { max?: number } } };
        };
      };
    };

    expect(defaults.methods.when.backfill?.signal?.runs?.max).toBe(3);
    expect(defaults.methods.when.runs?.max).toBe(2);
  });

  it("A05 — unsupported clear values throw set.defaults.invalid", () => {
    const run = createRuntime();

    expect(() =>
      run.set({ defaults: undefined } as unknown as Record<string, unknown>),
    ).toThrow("set.defaults.invalid");

    expect(() =>
      run.set({
        defaults: { gate: { flags: { value: undefined } } },
      } as unknown as Record<string, unknown>),
    ).toThrow("set.defaults.invalid");
  });

  it("A06/A07 — runs.max bounds and invalid values", () => {
    const run = createRuntime();
    let floorCalls = 0;
    let clampZeroCalls = 0;
    let clampNegativeCalls = 0;

    run.when({
      id: "expr:max:floor",
      runs: { max: 1.9 },
      flags: { f: false },
      targets: [() => floorCalls++],
    } as Record<string, unknown>);
    run.when({
      id: "expr:max:zero",
      runs: { max: 0 },
      flags: { z: false },
      targets: [() => clampZeroCalls++],
    } as Record<string, unknown>);
    run.when({
      id: "expr:max:neg",
      runs: { max: -10 },
      flags: { n: false },
      targets: [() => clampNegativeCalls++],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["f", "z", "n"] });
    run.impulse({ removeFlags: ["f", "z", "n"] });
    run.impulse({ addFlags: ["f", "z", "n"] });

    expect(floorCalls).toBe(1);
    expect(clampZeroCalls).toBe(1);
    expect(clampNegativeCalls).toBe(1);

    expect(() =>
      run.when({
        id: "expr:max:nan",
        runs: { max: Number.NaN },
        targets: [() => {}],
      } as Record<string, unknown>),
    ).toThrow("add.runs.max.invalid");
    expect(() =>
      run.when({
        id: "expr:max:str",
        runs: { max: "2" },
        targets: [() => {}],
      } as unknown as Record<string, unknown>),
    ).toThrow("add.runs.max.invalid");
  });
});

describe("conformance/use-case-coverage/flags", () => {
  it("F01/F02/F03/F04 transitions and shorthand behavior", () => {
    const run = createRuntime();
    let on = 0;
    let off = 0;
    let toggle = 0;
    let shorthand = 0;

    run.when({
      id: "expr:flag:on",
      flags: { xyz: false },
      targets: [() => on++],
    } as Record<string, unknown>);
    run.when({
      id: "expr:flag:off",
      flags: { xyz: true },
      targets: [() => off++],
    } as Record<string, unknown>);
    run.when({
      id: "expr:flag:toggle",
      flags: { xyz: "*" },
      targets: [() => toggle++],
    } as Record<string, unknown>);
    run.when({
      id: "expr:flag:shorthand",
      flags: "xyz",
      targets: [() => shorthand++],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });

    expect(on).toBe(2);
    expect(off).toBe(2);
    expect(toggle).toBe(4);
    expect(shorthand).toBe(2);
  });

  it("F05 no-op add/remove does not consume changed flags", () => {
    const run = createRuntime();
    let calls = 0;

    run.impulse({ addFlags: ["xyz"] });
    run.when({
      id: "expr:flag:off:noop",
      flags: { xyz: true },
      targets: [() => calls++],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ signals: ["s"], addFlags: ["xyz"] });

    expect(calls).toBe(0);
  });

  it("F07 required.flags.changed=2 requires both changes in same impulse", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({
      id: "expr:flag:changed:2",
      flags: { a: "*", b: "*" },
      required: { flags: { changed: 2 } },
      targets: [() => calls++],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["a"] });
    run.impulse({ addFlags: ["b"] });
    run.impulse({ removeFlags: ["a", "b"] });

    expect(calls).toBe(1);
  });
});

describe("conformance/use-case-coverage/impulse-delta", () => {
  it("I01 add+remove same flag in same impulse: remove wins and changed set", () => {
    const run = createRuntime();
    const changed: string[][] = [];

    run.impulse({ addFlags: ["xyz"] });
    run.when({
      id: "expr:delta:remove-wins",
      flags: { xyz: true },
      targets: [
        (i: { changedFlags: { list: string[] } }) =>
          changed.push([...i.changedFlags.list]),
      ],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["xyz"], removeFlags: ["xyz"] });

    expect(changed).toEqual([["xyz"]]);
    expect(
      (run.get("flags", { as: "snapshot" }) as { list: string[] }).list,
    ).not.toContain("xyz");
  });

  it("I02/I03 duplicate flag deltas apply once", () => {
    const run = createRuntime();
    let addCalls = 0;
    let removeCalls = 0;

    run.when({
      id: "expr:dup:add",
      flags: { dup: false },
      targets: [() => addCalls++],
    } as Record<string, unknown>);
    run.impulse({ addFlags: ["dup", "dup", "dup"] });

    run.when({
      id: "expr:dup:remove",
      flags: { dup: true },
      targets: [() => removeCalls++],
    } as Record<string, unknown>);
    run.impulse({ removeFlags: ["dup", "dup"] });

    expect(addCalls).toBe(1);
    expect(removeCalls).toBe(1);
  });
});

describe("conformance/use-case-coverage/signals-occurrences", () => {
  it("S04/E02 multi-signal impulse creates occurrences; runs.max applies in same impulse", () => {
    const run = createRuntime();
    const calls: string[] = [];
    const id = "expr:multi-occ";

    run.add({
      id,
      runs: { max: 2 },
      targets: [(i: { signal?: string }) => calls.push(i.signal ?? "")],
    } as Record<string, unknown>);
    run.impulse({ signals: ["s1", "s2", "s3"] });

    expect(calls).toEqual(["s1", "s2"]);
    expect((run.get("registeredById") as Map<string, unknown>).has(id)).toBe(
      false,
    );
  });

  it("S05 duplicate signals are distinct occurrences", () => {
    const run = createRuntime();
    const seen: string[] = [];

    run.add({
      id: "expr:signal:dups",
      targets: [(i: { signal?: string }) => seen.push(i.signal ?? "")],
    } as Record<string, unknown>);
    run.impulse({ signals: ["s", "s", "s"] });

    expect(seen).toEqual(["s", "s", "s"]);
  });
});

describe("conformance/use-case-coverage/retroactive", () => {
  it("RA01/RA02 retroactive signal hit/miss", () => {
    const run = createRuntime();
    let hit = 0;
    let miss = 0;

    run.impulse({ signals: ["seen"] });
    run.when({
      id: "expr:retro:hit",
      signal: "seen",
      retroactive: true,
      targets: [() => hit++],
    } as Record<string, unknown>);

    run.when({
      id: "expr:retro:miss",
      signal: "never",
      retroactive: true,
      targets: [() => miss++],
    } as Record<string, unknown>);
    expect(hit).toBe(1);
    expect(miss).toBe(0);

    run.impulse({ signals: ["never"] });
    expect(miss).toBe(1);
  });

  it("RA03 retroactive + flags blocked by default changed=1, allowed with changed=0", () => {
    const run = createRuntime();
    let blocked = 0;
    let allowed = 0;

    run.impulse({ signals: ["seen"] });

    run.when({
      id: "expr:retro:flags:blocked",
      signal: "seen",
      retroactive: true,
      flags: { x: "*" },
      targets: [() => blocked++],
    } as Record<string, unknown>);
    run.when({
      id: "expr:retro:flags:allowed",
      signal: "seen",
      retroactive: true,
      flags: { x: "*" },
      required: { flags: { changed: 0 } },
      targets: [() => allowed++],
    } as Record<string, unknown>);

    expect(blocked).toBe(0);
    expect(allowed).toBe(1);
  });
});

describe("conformance/use-case-coverage/errors-reentrancy", () => {
  it("callback throw still consumes runs.max budget", () => {
    const run = createRuntime();
    const id = "expr:throw:max1";

    run.when({
      id,
      runs: { max: 1 },
      flags: { a: false },
      targets: [
        () => {
          throw new Error("boom");
        },
      ],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["a"] });
    run.impulse({ removeFlags: ["a"] });
    run.impulse({ addFlags: ["a"] });

    expect((run.get("registeredById") as Map<string, unknown>).has(id)).toBe(
      false,
    );
  });

  it("G01 one expression throw does not block another", () => {
    const run = createRuntime();
    const seen: string[] = [];
    const diagnostics: string[] = [];

    run.onDiagnostic((d: { code: string }) => diagnostics.push(d.code));

    run.when({
      id: "expr:err:A",
      flags: { a: false },
      targets: [
        () => {
          throw new Error("a");
        },
      ],
    } as Record<string, unknown>);
    run.when({
      id: "expr:err:B",
      flags: { a: false },
      targets: [() => seen.push("B")],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["a"] });

    expect(seen).toEqual(["B"]);
    expect(diagnostics).toContain("runtime.target.error");
  });

  it("G03 reentrancy: nested impulse is processed deterministically after current target", () => {
    const run = createRuntime();
    const seen: string[] = [];

    run.when({
      id: "expr:re:A",
      flags: { a: false },
      targets: [
        () => {
          seen.push("A");
          run.impulse({ addFlags: ["b"] });
        },
      ],
    } as Record<string, unknown>);
    run.when({
      id: "expr:re:B",
      flags: { b: false },
      targets: [() => seen.push("B")],
    } as Record<string, unknown>);

    run.impulse({ addFlags: ["a"] });

    expect(seen).toEqual(["A", "B"]);
  });
});
