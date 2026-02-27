/**
 * @file packages/runtime/tests/conformance/use-case-coverage.spec.ts
 * @version 0.12.0
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Use-case coverage conformance suite (P0/P1).
 */
import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

function registeredById(
  run: ReturnType<typeof createRuntime>,
): Map<string, unknown> {
  return run.get("registeredById") as unknown as Map<string, unknown>;
}

describe("conformance/use-case-coverage/defaults-overlay", () => {
  it("A01 — run.when uses defaults.methods.when.runs.max", () => {
    const run = createRuntime();
    (run.set as (patch: Record<string, unknown>) => void)({
      defaults: { methods: { when: { runs: { max: 2 } } } },
    });

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
    (run.set as (patch: Record<string, unknown>) => void)({
      defaults: { methods: { when: { runs: { max: 5 } } } },
    });

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

    (run.set as (patch: Record<string, unknown>) => void)({
      defaults: { methods: { when: { runs: { max: 3 } } } },
    });
    let callsA = 0;
    run.when({
      id: "uc:A03:A",
      flags: { a: false },
      targets: [() => callsA++],
    });

    (run.set as (patch: Record<string, unknown>) => void)({
      defaults: { methods: { when: { runs: { max: 1 } } } },
    });
    let callsB = 0;
    run.when({
      id: "uc:A03:B",
      flags: { b: false },
      targets: [() => callsB++],
    });

    const exprA = registeredById(run).get("uc:A03:A") as unknown as {
      runs: { max: number };
    };
    const exprB = registeredById(run).get("uc:A03:B") as unknown as {
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

    (run.set as (patch: Record<string, unknown>) => void)({
      defaults: {
        methods: { when: { backfill: { signal: { runs: { max: 3 } } } } },
      },
    });
    (run.set as (patch: Record<string, unknown>) => void)({
      defaults: { methods: { when: { runs: { max: 2 } } } },
    });

    const defaults = run.get("defaults", { as: "snapshot" }) as unknown as {
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
      (
        registeredById(run).get("uc:A06:float") as unknown as {
          runs: { max: number };
        }
      ).runs.max,
    ).toBe(1);

    run.when({
      id: "uc:A06:zero",
      runs: { max: 0 },
      flags: { b: false },
      targets: [() => undefined],
    });
    expect(
      (
        registeredById(run).get("uc:A06:zero") as unknown as {
          runs: { max: number };
        }
      ).runs.max,
    ).toBe(1);

    run.when({
      id: "uc:A06:negative",
      runs: { max: -10 },
      flags: { c: false },
      targets: [() => undefined],
    });
    expect(
      (
        registeredById(run).get("uc:A06:negative") as unknown as {
          runs: { max: number };
        }
      ).runs.max,
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

describe("conformance/use-case-coverage/registry-id-uniqueness", () => {
  it("REG04 — re-registering a removed id must throw (no id reuse across tombstones)", () => {
    const run = createRuntime();

    const remove = run.when({
      id: "uc:REG04",
      signal: "s",
      targets: [() => undefined],
    });

    remove();

    expect(() =>
      run.when({
        id: "uc:REG04",
        signal: "s",
        targets: [() => undefined],
      }),
    ).toThrow("Duplicate registered expression id: uc:REG04");
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
        (i: unknown) => {
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
      (run.get("flags", { as: "snapshot" }) as unknown as { list: string[] })
        .list,
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
        (i: unknown) => {
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
        (i: unknown) => {
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
      (registeredById(run).get("uc:SREG01") as unknown as { signal?: string })
        .signal,
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
      (registeredById(run).get("uc:SREG02:0") as unknown as { signal?: string })
        .signal,
    ).toBe("a");
    expect(
      (registeredById(run).get("uc:SREG02:1") as unknown as { signal?: string })
        .signal,
    ).toBe("b");

    const diagnostics = run.get("diagnostics", {
      as: "snapshot",
    }) as unknown as Array<{
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

    const diagnostics = run.get("diagnostics", {
      as: "snapshot",
    }) as unknown as Array<{
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

    const diagnostics = run.get("diagnostics", {
      as: "snapshot",
    }) as unknown as Array<{
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

    const diagnostics = run.get("diagnostics", {
      as: "snapshot",
    }) as unknown as Array<{
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

    const diagnostics = run.get("diagnostics", {
      as: "snapshot",
    }) as unknown as Array<{
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

    const diagnostics = run.get("diagnostics", {
      as: "snapshot",
    }) as unknown as Array<{
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

    const diagnostics = run.get("diagnostics", {
      as: "snapshot",
    }) as unknown as Array<{
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
    ).toThrow("Duplicate registered expression id: uc:B01");
    expect(registeredById(run).has("uc:B01")).toBe(true);
  });

  it("B02 — deregistered ids cannot be re-registered", () => {
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

    expect(() =>
      run.when({
        id: "uc:B02",
        runs: { max: 1 },
        flags: { x: true },
        targets: [() => calls++],
      }),
    ).toThrow("Duplicate registered expression id: uc:B02");

    run.impulse({ removeFlags: ["x"] });
    expect(calls).toBe(1);
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

    const expression = registeredById(run).get("uc:INF") as unknown as {
      required: { flags: { max: number } };
    };

    expect(expression.required.flags.max).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("conformance/use-case-coverage/remove-lifecycle", () => {
  it("REG01 — remove() is idempotent", () => {
    const run = createRuntime();
    const remove = run.when({
      id: "uc:REG01",
      signal: "s",
      targets: [() => undefined],
    });

    expect(() => remove()).not.toThrow();
    expect(() => remove()).not.toThrow();

    expect(registeredById(run).has("uc:REG01")).toBe(false);
  });

  it("REG02 — remove() during drain (self-remove) is safe and applies next occurrence", () => {
    const run = createRuntime();
    let calls = 0;
    const remove = run.when({
      id: "uc:REG02",
      signal: "s",
      targets: [
        () => {
          calls += 1;
          remove();
        },
      ],
    });

    run.impulse({ signals: ["s"] });
    run.impulse({ signals: ["s"] });

    expect(calls).toBe(1);
    expect(registeredById(run).has("uc:REG02")).toBe(false);
  });

  it("REG03 — remove() before first impulse prevents any deploy", () => {
    const run = createRuntime();
    let calls = 0;
    const remove = run.when({
      id: "uc:REG03",
      signal: "s",
      targets: [() => calls++],
    });

    remove();
    run.impulse({ signals: ["s"] });

    expect(calls).toBe(0);
  });
});

describe("conformance/use-case-coverage/payload-immutability", () => {
  it("PAY01 — appliedExpression.payload is not mutable by targets (no ref leak)", () => {
    const run = createRuntime();
    const payload = { n: 1 };
    const seen: number[] = [];

    run.when({
      id: "uc:PAY01",
      signal: "s",
      payload,
      targets: [
        (_i: unknown, a: unknown) => {
          seen.push((a as { payload: { n: number } }).payload.n);
          (a as { payload: { n: number } }).payload.n = 999;
        },
      ],
    } as never);

    run.impulse({ signals: ["s"] });
    run.impulse({ signals: ["s"] });

    expect(seen).toEqual([1, 1]);
    expect(payload.n).toBe(1);
  });

  it("PAY02 — actExpression.payload (livePayload) is not mutable by targets (no ref leak)", () => {
    const run = createRuntime();
    const seen: number[] = [];

    run.when({
      id: "uc:PAY02",
      signal: "s",
      targets: [
        (i: unknown) => {
          seen.push((i as { payload: { n: number } }).payload.n);
          (i as { payload: { n: number } }).payload.n = 999;
        },
      ],
    });

    run.impulse({ signals: ["s"], livePayload: { n: 1 } });
    run.impulse({ signals: ["s"], livePayload: { n: 1 } });

    expect(seen).toEqual([1, 1]);
  });
});

describe("conformance/use-case-coverage/payload-snapshotting-safety", () => {
  it("PAY03 — add(payload) must not invoke getters while snapshotting", () => {
    const run = createRuntime();

    const payload = {} as Record<string, unknown>;
    Object.defineProperty(payload, "x", {
      enumerable: true,
      get() {
        throw new Error("getter-called");
      },
    });

    expect(() =>
      run.when({
        id: "uc:PAY03",
        signal: "s",
        payload,
        targets: [() => undefined],
      } as never),
    ).not.toThrow();
  });

  it("PAY04 — add(payload=array) must not use iterator while snapshotting", () => {
    const run = createRuntime();

    const payload: unknown[] = [];
    (payload as unknown as { [Symbol.iterator]: () => never })[
      Symbol.iterator
    ] = () => {
      throw new Error("iterator-called");
    };

    expect(() =>
      run.when({
        id: "uc:PAY04",
        signal: "s",
        payload,
        targets: [() => undefined],
      } as never),
    ).not.toThrow();
  });
});

describe("conformance/use-case-coverage/payload-null-proto", () => {
  it("PAY05 — null-proto object payload must be snapshotted (no ref-leak)", () => {
    const run = createRuntime();

    const payload = Object.create(null) as unknown as { n: number };
    payload.n = 1;

    const seen: number[] = [];

    run.when({
      id: "uc:PAY05",
      signal: "s",
      payload,
      targets: [
        (_i: unknown, a: unknown) => {
          seen.push((a as { payload: { n: number } }).payload.n);
          (a as { payload: { n: number } }).payload.n = 999;
        },
      ],
    } as never);

    run.impulse({ signals: ["s"] });
    run.impulse({ signals: ["s"] });

    expect(seen).toEqual([1, 1]);
    expect(payload.n).toBe(1);
  });
});

describe("conformance/use-case-coverage/payload-sparse-array", () => {
  it("PAY06 — sparse array payload snapshot must preserve holes (no densification)", () => {
    const run = createRuntime();

    const payload = new Array(3) as unknown as unknown[];
    payload[1] = "x";

    let seenHas0 = true;

    run.when({
      id: "uc:PAY06",
      signal: "s",
      payload,
      targets: [
        (_i: unknown, a: unknown) => {
          const snapshot = (a as { payload: unknown[] }).payload;
          seenHas0 = 0 in snapshot;
        },
      ],
    } as never);

    run.impulse({ signals: ["s"] });
    expect(seenHas0).toBe(false);
  });
});

describe("conformance/use-case-coverage/livePayload-no-ref-leak", () => {
  it("PAY07 — livePayload must be detached (no ref-leak across impulses)", () => {
    const run = createRuntime();

    const live = { n: 1 };
    const seen: number[] = [];

    run.when({
      id: "uc:PAY07",
      signal: "s",
      targets: [
        (i: unknown) => {
          seen.push((i as { payload: { n: number } }).payload.n);
          (i as { payload: { n: number } }).payload.n = 999;
        },
      ],
    } as never);

    run.impulse({ signals: ["s"], livePayload: live });
    run.impulse({ signals: ["s"], livePayload: live });

    expect(seen).toEqual([1, 1]);
    expect(live.n).toBe(1);
  });
});

describe("conformance/use-case-coverage/multi-signal-snapshot-once", () => {
  it("PAY08 — payload snapshotting must run once for multi-signal registration", () => {
    const run = createRuntime();

    let ownKeysCalls = 0;

    const payload = new Proxy(
      { a: 1 },
      {
        ownKeys(target) {
          ownKeysCalls += 1;
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, property) {
          return Reflect.getOwnPropertyDescriptor(target, property);
        },
      },
    );

    run.when({
      id: "uc:PAY08",
      signals: ["s1", "s2", "s3"],
      payload,
      targets: [() => undefined],
    } as never);

    expect(ownKeysCalls).toBe(1);
  });
});

describe("conformance/use-case-coverage/trim-onTrim-enqueue", () => {
  it("TRM01 — impulse enqueued in impulseQ.config.onTrim is preserved and processed later", () => {
    const run = createRuntime();
    let afterTrimCalls = 0;

    run.when({
      id: "uc:TRM01:after",
      signal: "afterTrim",
      targets: [() => afterTrimCalls++],
    });

    (run.set as (patch: Record<string, unknown>) => void)({
      impulseQ: {
        config: {
          maxBytes: 0,
          onTrim: () => {
            run.impulse({ signals: ["afterTrim"] });
          },
        },
      },
    } as never);

    run.impulse({ signals: ["trigger"] });
    expect(afterTrimCalls).toBe(0);
    run.impulse({ signals: ["tick"] });

    expect(afterTrimCalls).toBe(1);
  });

  it("SET-BASELINE-01 — trimming applied entries must not double-apply into scopeProjectionBaseline", () => {
    const run = createRuntime();

    const hydration = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;
    hydration.impulseQ = {
      config: { retain: 0, maxBytes: 1 },
      q: {
        cursor: 2,
        entries: [
          {
            signals: ["a"],
            addFlags: ["fa"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["b"],
            addFlags: ["fb"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: [],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };
    (
      hydration as { scopeProjectionBaseline: unknown }
    ).scopeProjectionBaseline = {
      flags: { list: [], map: {} },
      changedFlags: { list: [], map: {} },
      seenFlags: { list: [], map: {} },
      signal: undefined,
      seenSignals: { list: [], map: {} },
    };

    (run.set as (patch: Record<string, unknown>) => void)(hydration as never);

    const baseline = (
      run.get("scopeProjectionBaseline", { as: "snapshot" }) as unknown as {
        flags: { list: string[] };
      }
    ).flags;
    expect(baseline.list.sort()).toEqual(["fa", "fb"]);
  });

  it("SET-BASELINE-02 — hydration without scopeProjectionBaseline throws incomplete", () => {
    const run = createRuntime();

    const h0 = run.get("*", { as: "snapshot" }) as unknown as {
      scopeProjectionBaseline?: unknown;
    };
    h0.scopeProjectionBaseline = {
      flags: { list: ["BASE"], map: { BASE: true } },
      changedFlags: { list: [], map: {} },
      seenFlags: { list: [], map: {} },
      signal: undefined,
      seenSignals: { list: [], map: {} },
    };
    (run.set as (patch: Record<string, unknown>) => void)(h0 as never);

    run.impulse({ signals: ["non-pristine"] } as never);

    const h1 = run.get("*", { as: "snapshot" }) as unknown as {
      scopeProjectionBaseline?: unknown;
      impulseQ?: unknown;
    };
    delete h1.scopeProjectionBaseline;

    h1.impulseQ = {
      config: { retain: 0, maxBytes: 1 },
      q: {
        cursor: 1,
        entries: [
          {
            signals: ["x"],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: [],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    expect(() =>
      (run.set as (patch: Record<string, unknown>) => void)(h1 as never),
    ).toThrow("set.hydration.incomplete");
  });

  it('HYDRATE-STAR-01 — set(get("*",{as:"snapshot"})) never throws hydration.incomplete', () => {
    const run = createRuntime();
    run.when({ signal: "s", targets: [() => undefined] } as never);

    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(
        snap as never,
      ),
    ).not.toThrow();
  });

  it("HYDRATE-NEG-SPB-01 — scopeProjectionBaseline must be a record object", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.scopeProjectionBaseline = "nope";

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.scopeProjectionBaselineInvalid");
    expect(
      diags.some(
        (d) => d.code === "set.hydration.scopeProjectionBaselineInvalid",
      ),
    ).toBe(true);
  });

  it("HYDRATE-NEG-SPB-02 — scopeProjectionBaseline.flags must be flagsView", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    const scopeProjectionBaseline = snap.scopeProjectionBaseline as Record<
      string,
      unknown
    >;
    snap.scopeProjectionBaseline = {
      ...scopeProjectionBaseline,
      flags: { list: "nope", map: {} },
    };

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.flagsViewInvalid");
  });

  it("HYDRATE-NEG-SPB-03 — scopeProjectionBaseline.seenFlags must be flagsView", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    const scopeProjectionBaseline = snap.scopeProjectionBaseline as Record<
      string,
      unknown
    >;
    snap.scopeProjectionBaseline = {
      ...scopeProjectionBaseline,
      seenFlags: { list: [], map: "nope" },
    };

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.flagsViewInvalid");
  });

  it("HYDRATE-NEG-SIG-01 — signal must be string or undefined", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.signal = 123;

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.signalInvalid");
    expect(diags.some((d) => d.code === "set.hydration.signalInvalid")).toBe(
      true,
    );
  });

  it("HYDRATE-NEG-SS-01 — seenSignals must be a {list,map} record", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.seenSignals = { list: "nope", map: {} };

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.seenSignalsInvalid");
    expect(
      diags.some((d) => d.code === "set.hydration.seenSignalsInvalid"),
    ).toBe(true);
  });

  it("HYDRATE-NEG-FV-01 — flags views must be valid (list array, map record)", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.flags = { list: {}, map: {} };

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.flagsViewInvalid");
  });

  it('HYDRATE-POS-01 — set(get("*",{as:"snapshot"})) still works', () => {
    const run = createRuntime();
    run.when({ signal: "s", targets: [() => undefined] } as never);

    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).not.toThrow();
  });

  it("HYDRATE-NEG-01 — registeredQ must be an array", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.registeredQ = {};

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.registeredQInvalid");
    expect(
      diags.some((d) => d.code === "set.hydration.registeredQInvalid"),
    ).toBe(true);
  });

  it("HYDRATE-NEG-02 — registeredQ entries must have string id", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.registeredQ = [{ id: 1 }];

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.registeredQInvalid");
  });

  it("HYDRATE-NEG-03 — registeredQ ids must be unique non-empty", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.registeredQ = [{ id: "x" }, { id: "x" }];

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.registeredQInvalid");

    const snap2 = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;
    snap2.registeredQ = [{ id: "   " }];

    const rehydrated2 = createRuntime();
    expect(() =>
      (rehydrated2.set as (patch: Record<string, unknown>) => void)(snap2),
    ).toThrow("set.hydration.registeredQInvalid");
  });

  it("HYDRATE-NEG-04 — diagnostics must be an array", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.diagnostics = {};

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.diagnosticsInvalid");
    expect(
      diags.some((d) => d.code === "set.hydration.diagnosticsInvalid"),
    ).toBe(true);
  });

  it("HYDRATE-NEG-05 — diagnostics entries must have non-empty string code", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.diagnostics = [{ code: "" }];

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.diagnosticsInvalid");

    const snap2 = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;
    snap2.diagnostics = [{ msg: "x" }];

    const rehydrated2 = createRuntime();
    expect(() =>
      (rehydrated2.set as (patch: Record<string, unknown>) => void)(snap2),
    ).toThrow("set.hydration.diagnosticsInvalid");
  });

  it("HYDRATE-NEG-BF-01 — backfillQ must be a record object", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.backfillQ = "nope";

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.backfillQInvalid");
    expect(diags.some((d) => d.code === "set.hydration.backfillQInvalid")).toBe(
      true,
    );
  });

  it("HYDRATE-NEG-BF-02 — backfillQ.q must be a record object", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.backfillQ = { config: { retain: true }, q: "nope" };

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.backfillQInvalid");
    expect(diags.some((d) => d.code === "set.hydration.backfillQInvalid")).toBe(
      true,
    );
  });

  it("HYDRATE-NEG-BF-03 — backfillQ.q.entries must be an array", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.backfillQ = {
      config: { retain: true },
      q: { cursor: 0, entries: {} },
    };

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.backfillQInvalid");
    expect(diags.some((d) => d.code === "set.hydration.backfillQInvalid")).toBe(
      true,
    );
  });

  it("HYDRATE-NEG-BF-04 — backfillQ.q.cursor must be a number", () => {
    const run = createRuntime();
    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;

    snap.backfillQ = {
      config: { retain: true },
      q: { cursor: "0", entries: [] },
    };

    const rehydrated = createRuntime();
    const diags: Array<{ code?: string }> = [];
    rehydrated.onDiagnostic((d) => diags.push(d));

    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).toThrow("set.hydration.backfillQInvalid");
    expect(diags.some((d) => d.code === "set.hydration.backfillQInvalid")).toBe(
      true,
    );
  });

  it("HYDRATE-NEG-RG-01 — invalid registeredById does not fail hydration (it is ignored)", () => {
    const run = createRuntime();
    run.when({ signal: "s", targets: [() => undefined] } as never);

    const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;
    snap.registeredById = 123;

    const rehydrated = createRuntime();
    expect(() =>
      (rehydrated.set as (patch: Record<string, unknown>) => void)(snap),
    ).not.toThrow();
  });

  it("SET-TRIM-BASELINE-03 — pristine hydration without scopeProjectionBaseline throws incomplete", () => {
    const run = createRuntime();

    const h = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;
    delete (h as { scopeProjectionBaseline?: unknown }).scopeProjectionBaseline;

    h.impulseQ = {
      config: { retain: 0, maxBytes: 1 },
      q: {
        cursor: 2,
        entries: [
          {
            signals: ["a"],
            addFlags: ["fa"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["b"],
            addFlags: ["fb"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: [],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    expect(() =>
      (run.set as (patch: Record<string, unknown>) => void)(h as never),
    ).toThrow("set.hydration.incomplete");
  });

  it("SET-TRIM-BASELINE-04 — repeating hydration without scopeProjectionBaseline throws incomplete", () => {
    const run = createRuntime();

    const h = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;
    delete (h as { scopeProjectionBaseline?: unknown }).scopeProjectionBaseline;

    h.impulseQ = {
      config: { retain: 0, maxBytes: 1 },
      q: {
        cursor: 2,
        entries: [
          {
            signals: ["a"],
            addFlags: ["fa"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: ["b"],
            addFlags: ["fb"],
            removeFlags: [],
            useFixedFlags: false,
          },
          {
            signals: [],
            addFlags: [],
            removeFlags: [],
            useFixedFlags: false,
          },
        ],
      },
    };

    expect(() =>
      (run.set as (patch: Record<string, unknown>) => void)(h as never),
    ).toThrow("set.hydration.incomplete");

    const h2 = run.get("*", { as: "snapshot" }) as unknown as Record<
      string,
      unknown
    >;
    delete (h2 as { scopeProjectionBaseline?: unknown })
      .scopeProjectionBaseline;
    expect(() =>
      (run.set as (patch: Record<string, unknown>) => void)(h2 as never),
    ).toThrow("set.hydration.incomplete");
  });

  it("SET-PATCH-TRIM-BASELINE-01 — patch+trim must not double-apply removed applied entries into scopeProjectionBaseline", () => {
    const run = createRuntime();

    (run.set as (patch: Record<string, unknown>) => void)({
      impulseQ: { config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY } },
    } as never);
    run.impulse({ addFlags: ["fa"], signals: ["a"] });
    run.impulse({ addFlags: ["fb"], signals: ["b"] });

    (run.set as (patch: Record<string, unknown>) => void)({
      impulseQ: { config: { retain: 0, maxBytes: 1 } },
    } as never);

    const base = run.get("scopeProjectionBaseline", {
      as: "snapshot",
    }) as unknown as {
      flags: { list: string[] };
    };
    expect(base.flags.list.sort()).toEqual(["fa", "fb"]);
  });

  it("SET-PATCH-TRIM-BASELINE-02 — repeating same patch does not grow baseline further", () => {
    const run = createRuntime();

    (run.set as (patch: Record<string, unknown>) => void)({
      impulseQ: { config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY } },
    } as never);
    run.impulse({ addFlags: ["fa"], signals: ["a"] });
    run.impulse({ addFlags: ["fb"], signals: ["b"] });

    (run.set as (patch: Record<string, unknown>) => void)({
      impulseQ: { config: { retain: 0, maxBytes: 1 } },
    } as never);
    const b1 = run.get("scopeProjectionBaseline", {
      as: "snapshot",
    }) as unknown as {
      flags: { list: string[] };
    };
    expect(b1.flags.list.sort()).toEqual(["fa", "fb"]);

    (run.set as (patch: Record<string, unknown>) => void)({
      impulseQ: { config: { retain: 0, maxBytes: 1 } },
    } as never);
    const b2 = run.get("scopeProjectionBaseline", {
      as: "snapshot",
    }) as unknown as {
      flags: { list: string[] };
    };
    expect(b2.flags.list.sort()).toEqual(["fa", "fb"]);
  });
});

describe("conformance/use-case-coverage/auto-id-basics", () => {
  it('MIN-AUTO-01 — add without id allocates "0"', () => {
    const run = createRuntime();

    run.when({
      signal: "s",
      targets: [() => undefined],
    } as never);

    const keys = Array.from(registeredById(run).keys());
    expect(keys).toEqual(["0"]);
    expect(registeredById(run).has("0")).toBe(true);
  });

  it('MIN-AUTO-02 — multiple adds allocate monotonically "0","1","2"', () => {
    const run = createRuntime();

    run.when({
      signal: "s",
      targets: [() => undefined],
    } as never);
    expect(Array.from(registeredById(run).keys())).toEqual(["0"]);

    run.when({
      signal: "s",
      targets: [() => undefined],
    } as never);
    expect(Array.from(registeredById(run).keys())).toEqual(["0", "1"]);

    run.when({
      signal: "s",
      targets: [() => undefined],
    } as never);
    expect(Array.from(registeredById(run).keys())).toEqual(["0", "1", "2"]);
  });

  it('MIN-AUTO-03 — multi-signal allocates "0:0","0:1", next base is "1"', () => {
    const run = createRuntime();

    run.when({
      signals: ["a", "b"],
      targets: [() => undefined],
    } as never);
    expect(Array.from(registeredById(run).keys())).toEqual(["0:0", "0:1"]);

    run.when({
      signal: "x",
      targets: [() => undefined],
    } as never);
    expect(Array.from(registeredById(run).keys())).toEqual(["0:0", "0:1", "1"]);
  });

  it("MIN-AUTO-04 — auto-id does NOT rewind after remove", () => {
    const run = createRuntime();

    const remove = run.when({
      signal: "s",
      targets: [() => undefined],
    } as never);
    expect(Array.from(registeredById(run).keys())).toEqual(["0"]);

    remove();
    expect(Array.from(registeredById(run).keys())).toEqual([]);

    run.when({
      signal: "s",
      targets: [() => undefined],
    } as never);
    expect(Array.from(registeredById(run).keys())).toEqual(["1"]);
  });

  it("MIN-AUTO-05 — auto-id skips ids that were ever used by explicit id (no random throw)", () => {
    const run = createRuntime();

    // reserve "2" via explicit id, then remove -> remains in usedIds
    const remove = run.add({
      id: "2",
      signal: "s",
      targets: [() => undefined],
    } as never);
    remove();

    // allocate 0 and 1 normally
    run.when({ signal: "s", targets: [() => undefined] } as never);
    run.when({ signal: "s", targets: [() => undefined] } as never);

    // next auto would be "2" but MUST skip (because usedIds already has "2")
    expect(() =>
      run.when({ signal: "s", targets: [() => undefined] } as never),
    ).not.toThrow();

    expect(Array.from(registeredById(run).keys())).toEqual(["0", "1", "3"]);
  });
});

describe("conformance/use-case-coverage/public-api-optional-args", () => {
  it('MIN-API-01 — run.get() equals run.get("*",{as:"snapshot"})', () => {
    const run = createRuntime();

    expect(run.get()).toEqual(run.get("*", { as: "snapshot" }));
  });

  it('MIN-API-02 — run.get({as:"snapshot"}) alias remains run.get("*",{as:"snapshot"})', () => {
    const run = createRuntime();

    expect(run.get()).toEqual(run.get("*", { as: "snapshot" }));
  });

  it("MIN-API-03 — run.impulse() without args does not throw", () => {
    const run = createRuntime();

    expect(() => run.impulse()).not.toThrow();
  });
});

describe("conformance/use-case-coverage/target-targets-merge-order", () => {
  it("MIN-TGT-01/02 — all targets run exactly once and order is stable (targets[] then target)", () => {
    const run = createRuntime();
    const calls: string[] = [];
    const t1 = () => calls.push("t1");
    const t2 = () => calls.push("t2");
    const t3 = () => calls.push("t3");

    run.when({
      id: "uc:MIN-TGT",
      signal: "s",
      targets: [t1, t2],
      target: t3,
    } as never);

    run.impulse({ signals: ["s"] });

    expect(calls).toEqual(["t1", "t2", "t3"]);
  });
});

describe("conformance/use-case-coverage/add-input-reference-detach", () => {
  it("MIN-REF-01 — mutating original targets array after add must not affect runtime", () => {
    const run = createRuntime();
    const calls: string[] = [];
    const t1 = () => calls.push("t1");
    const t2 = () => calls.push("t2");
    const arr = [t1];

    run.when({ id: "uc:MIN-REF-01", signal: "s", targets: arr } as never);
    arr.push(t2);

    run.impulse({ signals: ["s"] });

    expect(calls).toEqual(["t1"]);
  });

  it("MIN-REF-02 — mutating original signals array after add must not create new registration", () => {
    const run = createRuntime();
    let calls = 0;
    const sigs = ["a", "b"];

    run.when({
      id: "uc:MIN-REF-02",
      signals: sigs,
      targets: [() => calls++],
    } as never);
    sigs.push("c");

    run.impulse({ signals: ["c"] });
    expect(calls).toBe(0);

    run.impulse({ signals: ["a"] });
    expect(calls).toBe(1);
  });
});

describe("conformance/use-case-coverage/add-validation", () => {
  it("MIN-VAL-01 — targets:[] throws add.target.required", () => {
    const run = createRuntime();

    expect(() =>
      run.when({ id: "uc:MIN-VAL-01", signal: "s", targets: [] } as never),
    ).toThrow("add.target.required");
  });

  it("ADD-ID-01 — explicit non-string id must emit add.id.invalid and throw", () => {
    const run = createRuntime();

    expect(() =>
      run.add({
        id: 123 as unknown as string,
        signal: "s",
        targets: [() => undefined],
      } as never),
    ).toThrow("add.id.invalid");
  });
});

describe("conformance/use-case-coverage/add-input-object-detach", () => {
  it("MIN-REF-03 — mutating backfill/required/runs input objects after add must not affect the registered expression", () => {
    const run = createRuntime();

    const backfill = {
      signal: { debt: 1, runs: { max: 3 } },
      flags: { debt: 2, runs: { max: 4 } },
    };

    const required = { flags: { max: 5, changed: 1 } };

    const runs = { max: 7 };

    run.when({
      id: "uc:MIN-REF-03",
      signal: "s",
      backfill,
      required,
      runs,
      targets: [() => undefined],
    } as never);

    // mutate inputs AFTER add
    backfill.signal.debt = 99;
    backfill.signal.runs.max = 99;
    backfill.flags.debt = 99;
    backfill.flags.runs.max = 99;

    required.flags.max = 99;
    required.flags.changed = 99;

    runs.max = 99;

    const reg = registeredById(run).get("uc:MIN-REF-03") as unknown as {
      backfill: {
        signal: { debt: number; runs: { max: number } };
        flags: { debt: number; runs: { max: number } };
      };
      required: { flags: { max: number; changed: number } };
      runs: { max: number };
    };

    expect(reg.backfill.signal.debt).toBe(1);
    expect(reg.backfill.signal.runs.max).toBe(3);
    expect(reg.backfill.flags.debt).toBe(2);
    expect(reg.backfill.flags.runs.max).toBe(4);

    expect(reg.required.flags.max).toBe(5);
    expect(reg.required.flags.changed).toBe(1);

    expect(reg.runs.max).toBe(7);
  });
});

describe("conformance/use-case-coverage/add-validation-more", () => {
  it("MIN-VAL-02 — targets: [undefined] is rejected deterministically", () => {
    const run = createRuntime();
    const diags: unknown[] = [];
    run.onDiagnostic((d) => diags.push(d));

    expect(() =>
      run.when({
        id: "uc:MIN-VAL-02",
        signal: "s",
        targets: [undefined as never],
      } as never),
    ).toThrow("add.objectTarget.missingEntrypoint");

    // should not register anything
    expect(registeredById(run).has("uc:MIN-VAL-02")).toBe(false);

    const codes = diags
      .filter(
        (d): d is { code: unknown } =>
          typeof d === "object" && d !== null && "code" in d,
      )
      .map((d) => d.code)
      .filter((c): c is string => typeof c === "string");
    expect(codes).toContain("add.objectTarget.missingEntrypoint");
  });
});

describe("conformance/use-case-coverage/string-input-policy", () => {
  it("MIN-STR-01 — empty/whitespace-only id/signal/signals/flags must be rejected", () => {
    const run = createRuntime();
    const diags: Array<{ code?: unknown }> = [];
    run.onDiagnostic((d) => diags.push(d));

    const expectRejectWithDiag = (
      fn: () => unknown,
      expectedThrow: string,
      expectedDiag?: string,
    ) => {
      const before = diags.length;
      expect(fn).toThrow(expectedThrow);
      const newly = diags
        .slice(before)
        .map((d) => d.code)
        .filter((c): c is string => typeof c === "string");
      if (expectedDiag !== undefined) {
        expect(newly).toContain(expectedDiag);
      }
    };

    // id
    expectRejectWithDiag(
      () =>
        run.when({
          id: "",
          signal: "s",
          targets: [() => undefined],
        } as never),
      "add.id.invalid",
      "add.id.invalid",
    );
    expect(registeredById(run).has("")).toBe(false);

    expectRejectWithDiag(
      () =>
        run.when({
          id: "   ",
          signal: "s",
          targets: [() => undefined],
        } as never),
      "add.id.invalid",
      "add.id.invalid",
    );
    expect(registeredById(run).has("   ")).toBe(false);

    // signal (single)
    expectRejectWithDiag(
      () =>
        run.when({
          id: "uc:MIN-STR-01:s1",
          signal: "",
          targets: [() => undefined],
        } as never),
      "add.signals.invalid",
      "add.signals.invalid",
    );

    expectRejectWithDiag(
      () =>
        run.when({
          id: "uc:MIN-STR-01:s2",
          signal: "   ",
          targets: [() => undefined],
        } as never),
      "add.signals.invalid",
      "add.signals.invalid",
    );

    // signals (array entries)
    expectRejectWithDiag(
      () =>
        run.when({
          id: "uc:MIN-STR-01:sa1",
          signals: [""],
          targets: [() => undefined],
        } as never),
      "add.signals.invalid",
      "add.signals.invalid",
    );

    expectRejectWithDiag(
      () =>
        run.when({
          id: "uc:MIN-STR-01:sa2",
          signals: ["a", "   "],
          targets: [() => undefined],
        } as never),
      "add.signals.invalid",
      "add.signals.invalid",
    );

    // flags token
    expectRejectWithDiag(
      () =>
        run.when({
          id: "uc:MIN-STR-01:f1",
          signal: "s",
          flags: [""],
          targets: [() => undefined],
        } as never),
      "add.flags.invalidToken",
    );

    expectRejectWithDiag(
      () =>
        run.when({
          id: "uc:MIN-STR-01:f2",
          signal: "s",
          flags: ["   "],
          targets: [() => undefined],
        } as never),
      "add.flags.invalidToken",
    );
  });

  it("MIN-STR-02 — impulse signal input is canonicalized via trim", () => {
    const run = createRuntime();
    let calls = 0;

    run.when({
      id: "uc:MIN-STR-02",
      signal: "a",
      targets: [() => calls++],
    } as never);

    run.impulse({ signals: ["a"] });
    expect(calls).toBe(1);

    run.impulse({ signals: ["  a "] });
    expect(calls).toBe(2);
  });
});
