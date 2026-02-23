import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { readonlyView } from "../../src/runtime/util.js";
import {
  benchCase,
  printJson,
  type BenchMeta,
  type BenchResult,
} from "./_bench.js";

type ScenarioName = "small" | "medium" | "large";
type BenchKey = "flags" | "impulseQ" | "registeredById" | "*";

type FlagsBenchView = {
  list: string[];
  map: Record<string, boolean>;
};

type ScenarioConfig = {
  flagsSize: number;
  impulseEntries: number;
  registeredCount: number;
  iters: number;
};

const shouldBench = process.env.RUNTIME_BENCH === "1";

const SCENARIOS: Record<ScenarioName, ScenarioConfig> = {
  small: {
    flagsSize: 16,
    impulseEntries: 1,
    registeredCount: 3,
    iters: 10_000,
  },
  medium: {
    flagsSize: 1000,
    impulseEntries: 50,
    registeredCount: 200,
    iters: 2000,
  },
  large: {
    flagsSize: 5000,
    impulseEntries: 500,
    registeredCount: 2000,
    iters: 200,
  },
};

const KEYS: BenchKey[] = ["flags", "impulseQ", "registeredById", "*"];

(shouldBench ? describe : describe.skip)("bench/get(as)", () => {
  for (const scenario of ["small", "medium", "large"] as const) {
    it(`BENCH-GET-AS-01 (${scenario})`, () => {
      const run = buildScenario(scenario);
      const config = SCENARIOS[scenario];
      const results: BenchResult[] = [];

      for (const key of KEYS) {
        results.push(
          benchCase(
            `${scenario}:${key}:referenceRaw`,
            () => {
              const value = run.get(key, { as: "reference" });
              void value;
            },
            { iters: config.iters },
          ),
        );

        results.push(
          benchCase(
            `${scenario}:${key}:referenceReadonlyView`,
            () => {
              const value = readonlyView(run.get(key, { as: "reference" }));
              void value;
            },
            { iters: config.iters },
          ),
        );

        results.push(
          benchCase(
            `${scenario}:${key}:snapshot`,
            () => {
              const value = run.get(key, { as: "snapshot" });
              void value;
            },
            { iters: config.iters },
          ),
        );
      }

      let sink = 0;
      const accessIters = Math.max(10, Math.floor(config.iters / 4));

      results.push(
        benchCase(
          `${scenario}:flags:referenceRaw_access`,
          () => {
            const r = run.get("flags", { as: "reference" }) as FlagsBenchView;
            sink += r.list.length;
            sink += r.map.k10 ? 1 : 0;
          },
          { iters: accessIters },
        ),
      );

      results.push(
        benchCase(
          `${scenario}:flags:referenceReadonlyView_access`,
          () => {
            const rv = readonlyView(
              run.get("flags", { as: "reference" }),
            ) as FlagsBenchView;
            sink += rv.list.length;
            sink += rv.map.k10 ? 1 : 0;
          },
          { iters: accessIters },
        ),
      );

      results.push(
        benchCase(
          `${scenario}:flags:snapshot_access`,
          () => {
            const s = run.get("flags", { as: "snapshot" }) as FlagsBenchView;
            sink += s.list.length;
            sink += s.map.k10 ? 1 : 0;
          },
          { iters: accessIters },
        ),
      );

      expect(sink).toBeGreaterThan(0);

      const meta: BenchMeta = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        date: new Date().toISOString(),
        scenario,
      };

      printJson(results, meta);

      for (const result of results) {
        console.log(
          `${result.name}: ${result.nsPerOp.toFixed(1)} ns/op (${result.ms.toFixed(1)} ms)`,
        );
      }
    });
  }
});

function buildScenario(name: ScenarioName) {
  const run = createRuntime();
  const config = SCENARIOS[name];

  const flagsList = Array.from({ length: config.flagsSize }, (_, i) => `k${i}`);
  const flagsMap = Object.fromEntries(
    flagsList.map((key) => [key, true]),
  ) as Record<string, true>;

  run.set({
    flags: {
      list: flagsList,
      map: flagsMap,
    },
    impulseQ: {
      config: {
        retain: true,
      },
    },
  } as never);

  for (let i = 0; i < config.impulseEntries; i += 1) {
    run.impulse({
      signals: name === "small" ? [`sig-${i}`] : [`sig-${i}`, `sig-${i + 1}`],
      livePayload: buildPayload(name, i),
    } as never);
  }

  for (let i = 0; i < config.registeredCount; i += 1) {
    if (name === "small") {
      run.when({
        id: `bench:${name}:${i}`,
        signal: `reg-${i}`,
        targets: [() => undefined],
      } as never);
      continue;
    }

    run.when({
      signal: `reg-${i}`,
      targets: [() => undefined],
    } as never);
  }

  return run;
}

function buildPayload(name: ScenarioName, i: number): Record<string, unknown> {
  if (name === "small") {
    return {
      a: i,
      b: i + 1,
      c: `v-${i}`,
      d: i % 2 === 0,
      e: `x-${i}`,
    };
  }

  if (name === "medium") {
    return {
      p0: i,
      p1: i + 1,
      p2: `v-${i}`,
      p3: i % 2 === 0,
      p4: i * 2,
      p5: {
        x: i,
        y: `y-${i}`,
      },
      p6: {
        nested: {
          ok: true,
        },
      },
      p7: [i, i + 1],
      p8: `s-${i}`,
      p9: {
        level: 1,
      },
    };
  }

  return {
    root: {
      level1: {
        level2: {
          level3: {
            level4: {
              value: i,
            },
          },
        },
      },
    },
    map: new Map(Array.from({ length: 100 }, (_, idx) => [`m${idx}`, idx + i])),
    set: new Set(Array.from({ length: 100 }, (_, idx) => `s${idx + i}`)),
  };
}
