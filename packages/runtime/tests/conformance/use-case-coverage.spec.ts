/**
 * @file packages/runtime/tests/conformance/use-case-coverage.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Use-case coverage conformance suite (P0/P1).
 */
import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

function registeredById(
  run: ReturnType<typeof createRuntime>,
): Map<string, unknown> {
  return run.get("registeredById") as Map<string, unknown>;
}

describe("conformance/use-case-coverage/defaults-overlay", () => {
  it("A01 — run.when uses defaults.methods.when.runs.max", () => {
    const run = createRuntime();
    run.set({ defaults: { methods: { when: { runs: { max: 2 } } } } });

    let calls = 0;
    run.when({ id: "uc:A01", flags: { xyz: false }, targets: [() => calls++] });

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });

    expect(calls).toBe(2);
    expect(registeredById(run).has("uc:A01")).toBe(false);
  });

  it("A02 — call override beats defaults", () => {
    const run = createRuntime();
    run.set({ defaults: { methods: { when: { runs: { max: 5 } } } } });

    let calls = 0;
    run.when({
      id: "uc:A02",
      runs: { max: 1 },
      flags: { xyz: false },
      targets: [() => calls++],
    });

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });

    expect(calls).toBe(1);
    expect(registeredById(run).has("uc:A02")).toBe(false);
  });

  it("A03 — defaults are non-retroactive", () => {
    const run = createRuntime();

    run.set({ defaults: { methods: { when: { runs: { max: 3 } } } } });
    let callsA = 0;
    run.when({
      id: "uc:A03:A",
      flags: { a: false },
      targets: [() => callsA++],
    });

    run.set({ defaults: { methods: { when: { runs: { max: 1 } } } } });
    let callsB = 0;
    run.when({
      id: "uc:A03:B",
      flags: { b: false },
      targets: [() => callsB++],
    });

    const exprA = registeredById(run).get("uc:A03:A") as {
      runs: { max: number };
    };
    const exprB = registeredById(run).get("uc:A03:B") as {
      runs: { max: number };
    };
    expect(exprA.runs.max).toBe(3);
    expect(exprB.runs.max).toBe(1);

    run.impulse({ addFlags: ["a"] });
    run.impulse({ removeFlags: ["a"] });
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

  it("A04 — deep-merge semantics in defaults.methods.when", () => {
    const run = createRuntime();

    run.set({
      defaults: {
        methods: { when: { backfill: { signal: { runs: { max: 3 } } } } },
      },
    });
    run.set({ defaults: { methods: { when: { runs: { max: 2 } } } } });

    const defaults = run.get("defaults", { as: "snapshot" }) as {
      methods: {
        when: {
          backfill: { signal: { runs: { max: number } } };
          runs: { max: number };
        };
      };
    };

    expect(defaults.methods.when.backfill.signal.runs.max).toBe(3);
    expect(defaults.methods.when.runs.max).toBe(2);
  });

  it("A06/A07 — runs.max canonicalization and invalids", () => {
    const run = createRuntime();

    run.when({
      id: "uc:A06:float",
      runs: { max: 1.9 },
      flags: { a: false },
      targets: [() => undefined],
    });
    expect(
      (registeredById(run).get("uc:A06:float") as { runs: { max: number } })
        .runs.max,
    ).toBe(1);

    run.when({
      id: "uc:A06:zero",
      runs: { max: 0 },
      flags: { b: false },
      targets: [() => undefined],
    });
    expect(
      (registeredById(run).get("uc:A06:zero") as { runs: { max: number } }).runs
        .max,
    ).toBe(1);

    run.when({
      id: "uc:A06:negative",
      runs: { max: -10 },
      flags: { c: false },
      targets: [() => undefined],
    });
    expect(
      (registeredById(run).get("uc:A06:negative") as { runs: { max: number } })
        .runs.max,
    ).toBe(1);

    expect(() =>
      run.when({
        id: "uc:A07:nan",
        runs: { max: Number.NaN },
        flags: { d: false },
        targets: [() => undefined],
      }),
    ).toThrow("add.runs.max.invalid");

    expect(() =>
      run.when({
        id: "uc:A07:string",
        runs: { max: "2" as unknown as number },
        flags: { e: false },
        targets: [() => undefined],
      }),
    ).toThrow("add.runs.max.invalid");
  });
});

describe("conformance/use-case-coverage/flags", () => {
  it("F01 — fire when flag turns ON", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({ id: "uc:F01", flags: { xyz: false }, targets: [() => calls++] });

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });

    expect(calls).toBe(2);
  });

  it("F02 — fire when flag turns OFF", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({ id: "uc:F02", flags: { xyz: true }, targets: [() => calls++] });

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });

    expect(calls).toBe(2);
  });

  it("F03 — fire on every toggle", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({ id: "uc:F03", flags: { xyz: "*" }, targets: [() => calls++] });

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });

    expect(calls).toBe(4);
  });

  it("F04 — flags:'xyz' shorthand equals {xyz:true}", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({ id: "uc:F04", flags: "xyz", targets: [() => calls++] });

    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });
    run.impulse({ addFlags: ["xyz"] });
    run.impulse({ removeFlags: ["xyz"] });

    expect(calls).toBe(2);
  });

  it("C02 — no-op add/remove must not consume or trigger", () => {
    const run = createRuntime();
    let calls = 0;

    run.impulse({ addFlags: ["noop"] });
    run.when({ id: "uc:C02", flags: { noop: true }, targets: [() => calls++] });

    run.impulse({ addFlags: ["noop"] });
    expect(calls).toBe(0);

    run.impulse({ signals: ["s"], addFlags: ["noop"] });
    expect(calls).toBe(0);
  });
});

describe("conformance/use-case-coverage/impulse-delta", () => {
  it("I01 — add+remove same flag in one impulse: remove wins + changedFlags contains it", () => {
    const run = createRuntime();
    let calls = 0;
    let captured: unknown;

    run.impulse({ addFlags: ["mix"] });
    run.when({
      id: "uc:I01",
      flags: { mix: true },
      targets: [
        (i) => {
          calls += 1;
          captured = i;
        },
      ],
    });

    run.impulse({ addFlags: ["mix"], removeFlags: ["mix"] });

    expect(calls).toBe(1);
    expect(
      (captured as { changedFlags: { list: string[] } }).changedFlags.list,
    ).toContain("mix");
    expect(
      (run.get("flags", { as: "snapshot" }) as { list: string[] }).list,
    ).not.toContain("mix");
  });

  it("I02/I03 — duplicate flags in add/remove count as one change", () => {
    const run = createRuntime();

    let addCalls = 0;
    run.when({
      id: "uc:I02",
      flags: { dup: false },
      targets: [() => addCalls++],
    });
    run.impulse({ addFlags: ["dup", "dup", "dup"] });
    expect(addCalls).toBe(1);

    let removeCalls = 0;
    run.impulse({ addFlags: ["dup"] });
    run.when({
      id: "uc:I03",
      flags: { dup: true },
      targets: [() => removeCalls++],
    });
    run.impulse({ removeFlags: ["dup", "dup"] });
    expect(removeCalls).toBe(1);
  });
});

describe("conformance/use-case-coverage/signals-occurrences", () => {
  it("S04/E02 — multi-signal impulse enforces runs.max within same impulse", () => {
    const run = createRuntime();
    const seen: string[] = [];

    run.add({
      id: "uc:S04",
      runs: { max: 2 },
      targets: [
        (i) => {
          seen.push((i as { signal?: string }).signal ?? "");
        },
      ],
    });

    run.impulse({ signals: ["s1", "s2", "s3"] });

    expect(seen).toEqual(["s1", "s2"]);
    expect(registeredById(run).has("uc:S04")).toBe(false);
  });

  it("S05 — duplicate signals are real occurrences", () => {
    const run = createRuntime();
    const hits: string[] = [];

    run.add({
      id: "uc:S05",
      runs: { max: 10 },
      targets: [
        (i) => {
          hits.push((i as { signal?: string }).signal ?? "");
        },
      ],
    });

    run.impulse({ signals: ["a", "a", "a"] });

    expect(hits.length).toBe(3);
  });
});

describe("conformance/use-case-coverage/signals-registration", () => {
  it("SREG01 — signals:[] means no signal and no suffixed ids", () => {
    const run = createRuntime();

    run.when({ id: "uc:SREG01", signals: [], targets: [() => undefined] });

    expect(registeredById(run).has("uc:SREG01")).toBe(true);
    expect(registeredById(run).has("uc:SREG01:0")).toBe(false);
    expect(
      (registeredById(run).get("uc:SREG01") as { signal?: string }).signal,
    ).toBeUndefined();
  });

  it("SREG02 — signals are deduped by first occurrence + diagnostic", () => {
    const run = createRuntime();

    run.when({
      id: "uc:SREG02",
      signals: ["a", "a", "b"],
      targets: [() => undefined],
    });

    expect(registeredById(run).has("uc:SREG02:0")).toBe(true);
    expect(registeredById(run).has("uc:SREG02:1")).toBe(true);
    expect(
      (registeredById(run).get("uc:SREG02:0") as { signal?: string }).signal,
    ).toBe("a");
    expect(
      (registeredById(run).get("uc:SREG02:1") as { signal?: string }).signal,
    ).toBe("b");

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
      data?: { deduped?: string[] };
    }>;
    const dedupDiagnostic = diagnostics.find(
      (diagnostic) => diagnostic.code === "add.signals.dedup",
    );

    expect(dedupDiagnostic).toBeDefined();
    expect(dedupDiagnostic?.data?.deduped).toEqual(["a", "b"]);
  });

  it("SREG03 — remove closure removes all signal-derived expressions", () => {
    const run = createRuntime();

    const remove = run.when({
      id: "uc:SREG03",
      signals: ["s1", "s2"],
      targets: [() => undefined],
    });

    expect(registeredById(run).has("uc:SREG03:0")).toBe(true);
    expect(registeredById(run).has("uc:SREG03:1")).toBe(true);

    remove();

    expect(registeredById(run).has("uc:SREG03:0")).toBe(false);
    expect(registeredById(run).has("uc:SREG03:1")).toBe(false);
  });

  it("SREG04 — invalid signal throws even when signals is set", () => {
    const run = createRuntime();

    expect(() =>
      run.when({
        id: "uc:SREG04",
        signals: ["ok"],
        signal: 123 as never,
        targets: [() => undefined],
      } as never),
    ).toThrow("add.signals.invalid");

    expect(registeredById(run).has("uc:SREG04")).toBe(false);
    expect(registeredById(run).has("uc:SREG04:0")).toBe(false);

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
    }>;
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.code === "add.signals.invalid",
      ),
    ).toBe(true);
  });

  it("SREG05 — non-string signal item throws + diagnostic index", () => {
    const run = createRuntime();

    expect(() =>
      run.when({
        id: "uc:SREG05",
        signals: ["a", 1] as unknown as string[],
        targets: [() => undefined],
      }),
    ).toThrow("add.signals.invalid");

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
      data?: { index?: number };
    }>;
    const invalidSignalDiagnostic = diagnostics.find(
      (diagnostic) => diagnostic.code === "add.signals.invalid",
    );

    expect(invalidSignalDiagnostic).toBeDefined();
    expect(invalidSignalDiagnostic?.data?.index).toBe(1);
  });
});

describe("conformance/use-case-coverage/object-target-validation", () => {
  it("OBJ01 — missing on entrypoint throws + diagnostic", () => {
    const run = createRuntime();

    expect(() =>
      run.when({
        id: "uc:OBJ01",
        signal: "s",
        targets: [{} as never],
      }),
    ).toThrow("add.objectTarget.missingEntrypoint");

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
    }>;
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "add.objectTarget.missingEntrypoint",
      ),
    ).toBe(true);
    expect(registeredById(run).has("uc:OBJ01")).toBe(false);
  });

  it("OBJ02 — missing handler throws + diagnostic signal", () => {
    const run = createRuntime();

    expect(() =>
      run.when({
        id: "uc:OBJ02",
        signal: "s",
        targets: [{ on: {} } as never],
      }),
    ).toThrow("add.objectTarget.missingHandler");

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
      data?: { signal?: string };
    }>;
    const missingHandlerDiagnostic = diagnostics.find(
      (diagnostic) => diagnostic.code === "add.objectTarget.missingHandler",
    );

    expect(missingHandlerDiagnostic).toBeDefined();
    expect(missingHandlerDiagnostic?.data?.signal).toBe("s");
    expect(registeredById(run).has("uc:OBJ02")).toBe(false);
  });

  it("OBJ03 — non-callable handler throws + diagnostic signal", () => {
    const run = createRuntime();

    expect(() =>
      run.when({
        id: "uc:OBJ03",
        signal: "s",
        targets: [{ on: { s: 123 } } as never],
      }),
    ).toThrow("add.objectTarget.nonCallableHandler");

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
      data?: { signal?: string };
    }>;
    const nonCallableDiagnostic = diagnostics.find(
      (diagnostic) => diagnostic.code === "add.objectTarget.nonCallableHandler",
    );

    expect(nonCallableDiagnostic).toBeDefined();
    expect(nonCallableDiagnostic?.data?.signal).toBe("s");
    expect(registeredById(run).has("uc:OBJ03")).toBe(false);
  });

  it("OBJ04 — reserved everyRun signal throws missingHandler", () => {
    const run = createRuntime();

    expect(() =>
      run.when({
        id: "uc:OBJ04",
        signals: ["everyRun"],
        targets: [{ on: { everyRun: () => undefined } } as never],
      }),
    ).toThrow("add.objectTarget.missingHandler");

    const diagnostics = run.get("diagnostics", { as: "snapshot" }) as Array<{
      code: string;
      data?: { signal?: string };
    }>;
    const missingHandlerDiagnostic = diagnostics.find(
      (diagnostic) => diagnostic.code === "add.objectTarget.missingHandler",
    );

    expect(missingHandlerDiagnostic).toBeDefined();
    expect(missingHandlerDiagnostic?.data?.signal).toBe("everyRun");
    expect(registeredById(run).has("uc:OBJ04")).toBe(false);
    expect(registeredById(run).has("uc:OBJ04:0")).toBe(false);
  });
});

describe("conformance/use-case-coverage/retroactive", () => {
  it("RA01 — retroactive + seen signal deploys immediately", () => {
    const run = createRuntime();
    run.impulse({ signals: ["seen"] });

    let calls = 0;
    run.when({
      id: "uc:RA01",
      signal: "seen",
      retroactive: true,
      targets: [() => calls++],
    });

    expect(calls).toBe(1);
  });

  it("RA02 — retroactive + unseen signal does not deploy immediately", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({
      id: "uc:RA02",
      signal: "never",
      retroactive: true,
      targets: [() => calls++],
    });

    expect(calls).toBe(0);
    run.impulse({ signals: ["never"] });
    expect(calls).toBe(1);
  });

  it("RA03 — retroactive + flags: changed default blocks, changed=0 allows", () => {
    const run = createRuntime();
    run.impulse({ signals: ["seen2"] });

    let a = 0;
    run.when({
      id: "uc:RA03:A",
      signal: "seen2",
      retroactive: true,
      flags: { x: "*" },
      targets: [() => a++],
    });
    expect(a).toBe(0);

    let b = 0;
    run.when({
      id: "uc:RA03:B",
      signal: "seen2",
      retroactive: true,
      flags: { x: "*" },
      required: { flags: { changed: 0 } },
      targets: [() => b++],
    });
    expect(b).toBe(1);
  });
});

describe("conformance/use-case-coverage/errors-isolation-order", () => {
  it("F03 — throwing callback still consumes budget (onError report)", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({
      id: "uc:F03:error-budget",
      runs: { max: 1 },
      flags: { boom: false },
      targets: [
        () => {
          calls += 1;
          throw new Error("boom");
        },
      ],
      onError: "report",
    });

    run.impulse({ addFlags: ["boom"] });
    run.impulse({ removeFlags: ["boom"] });
    run.impulse({ addFlags: ["boom"] });

    expect(calls).toBe(1);
    expect(registeredById(run).has("uc:F03:error-budget")).toBe(false);
  });

  it("G01 — one expression throws, another still runs", () => {
    const run = createRuntime();
    const order: string[] = [];

    run.when({
      id: "uc:G01:A",
      flags: { iso: false },
      targets: [
        () => {
          order.push("A");
          throw new Error("A");
        },
      ],
      onError: "report",
    });
    run.when({
      id: "uc:G01:B",
      flags: { iso: false },
      targets: [() => order.push("B")],
    });

    run.impulse({ addFlags: ["iso"] });

    expect(order).toContain("B");
  });

  it("G02 — deterministic registration order", () => {
    const run = createRuntime();
    const order: string[] = [];

    run.when({
      id: "uc:G02:A",
      flags: { ord: false },
      targets: [() => order.push("A")],
    });
    run.when({
      id: "uc:G02:B",
      flags: { ord: false },
      targets: [() => order.push("B")],
    });

    run.impulse({ addFlags: ["ord"] });

    expect(order).toEqual(["A", "B"]);
  });

  it("G03 — reentrancy impulse enqueued during drain is deterministic", () => {
    const run = createRuntime();
    const order: string[] = [];

    run.when({
      id: "uc:G03:A",
      flags: { a: false },
      targets: [
        () => {
          order.push("A");
          run.impulse({ addFlags: ["b"] });
        },
      ],
    });
    run.when({
      id: "uc:G03:B",
      flags: { b: false },
      targets: [() => order.push("B")],
    });

    run.impulse({ addFlags: ["a"] });

    expect(order).toEqual(["A", "B"]);
  });
});

describe("conformance/use-case-coverage/id-registration", () => {
  it("B01 — duplicate id registration throws and keeps first expression", () => {
    const run = createRuntime();
    const noop = () => undefined;

    run.when({ id: "uc:B01", flags: { d: false }, targets: [noop] });

    expect(() =>
      run.when({ id: "uc:B01", flags: { d: false }, targets: [noop] }),
    ).toThrow(/Duplicate registered expression id/i);
    expect(registeredById(run).has("uc:B01")).toBe(true);
  });

  it("B02 — deregister then re-register with same id is allowed", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({
      id: "uc:B02",
      runs: { max: 1 },
      flags: { x: false },
      targets: [() => calls++],
    });

    run.impulse({ addFlags: ["x"] });
    expect(calls).toBe(1);
    expect(registeredById(run).has("uc:B02")).toBe(false);

    run.when({
      id: "uc:B02",
      runs: { max: 1 },
      flags: { x: true },
      targets: [() => calls++],
    });

    run.impulse({ removeFlags: ["x"] });
    expect(calls).toBe(2);
    expect(registeredById(run).has("uc:B02")).toBe(false);
  });

  it("B03 — runtimeCore.remove for unknown id is a no-op", () => {
    const run = createRuntime();
    let calls = 0;

    run.add({
      id: "uc:B03",
      targets: [
        (_i, _a, runtimeCore) => {
          (runtimeCore as { remove: (id: string) => void }).remove(
            "does-not-exist",
          );
          calls += 1;
        },
      ],
    });

    run.impulse({ signals: ["s"] });
    expect(calls).toBe(1);
  });
});

describe("conformance/use-case-coverage/required-flags-thresholds", () => {
  it("C05 — required.flags.min=1 supports OR semantics in steady-state", () => {
    const run = createRuntime();
    run.impulse({ addFlags: ["a"] });

    let calls = 0;
    run.when({
      id: "uc:C05",
      signal: "tick",
      flags: { a: true, b: true },
      required: { flags: { min: 1, changed: 0 } },
      targets: [() => calls++],
    });

    run.impulse({ signals: ["tick"] });
    expect(calls).toBe(1);

    run.impulse({ removeFlags: ["a"] });
    run.impulse({ signals: ["tick"] });
    expect(calls).toBe(1);
  });

  it("C06 — required.flags.max=1 blocks when two specs match in steady-state", () => {
    const run = createRuntime();
    run.impulse({ addFlags: ["a"] });

    let calls = 0;
    run.when({
      id: "uc:C06",
      signal: "tick",
      flags: { a: true, b: true },
      required: { flags: { min: 0, max: 1, changed: 0 } },
      targets: [() => calls++],
    });

    run.impulse({ signals: ["tick"] });
    expect(calls).toBe(1);

    run.impulse({ addFlags: ["b"] });
    run.impulse({ signals: ["tick"] });
    expect(calls).toBe(1);
  });

  it("C07 — required.flags.changed=2 requires both specs changed in one impulse", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({
      id: "uc:C07",
      flags: { a: "*", b: "*" },
      required: { flags: { changed: 2 } },
      targets: [() => calls++],
    });

    run.impulse({ addFlags: ["a"] });
    expect(calls).toBe(0);
    run.impulse({ addFlags: ["b"] });
    expect(calls).toBe(0);
    run.impulse({ removeFlags: ["a", "b"] });
    expect(calls).toBe(1);
  });

  it("C08 — without flags specs changed clamps to 0 and signal gate decides", () => {
    const run = createRuntime();
    let calls = 0;

    run.add({
      id: "uc:C08",
      signal: "s",
      required: { flags: { changed: 5 } },
      targets: [() => calls++],
    });

    run.impulse({ signals: ["t"] });
    expect(calls).toBe(0);
    run.impulse({ signals: ["s"] });
    expect(calls).toBe(1);
  });

  it("E03 — signal + flags needs changed:0 for steady-state feature-enabled case", () => {
    const run = createRuntime();
    run.impulse({ addFlags: ["enabled"] });

    let a = 0;
    run.when({
      id: "uc:E03:A",
      signal: "submit",
      flags: { enabled: true },
      targets: [() => a++],
    });
    run.impulse({ signals: ["submit"] });
    expect(a).toBe(0);

    let b = 0;
    run.when({
      id: "uc:E03:B",
      signal: "submit",
      flags: { enabled: true },
      required: { flags: { changed: 0 } },
      targets: [() => b++],
    });
    run.impulse({ signals: ["submit"] });
    expect(b).toBe(1);
  });
});

describe("conformance/use-case-coverage/required-flags-infinity", () => {
  it("INF — required.flags.max accepts Infinity and stores it", () => {
    const run = createRuntime();

    run.when({
      id: "uc:INF",
      flags: { inf: "*" },
      required: { flags: { max: Number.POSITIVE_INFINITY } },
      targets: [() => undefined],
    });

    const expression = registeredById(run).get("uc:INF") as {
      required: { flags: { max: number } };
    };

    expect(expression.required.flags.max).toBe(Number.POSITIVE_INFINITY);
  });
});
