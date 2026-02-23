import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { readonlyView } from "../../src/runtime/util.js";
import {
  benchCase,
  diffMem,
  mem,
  printJson,
  type BenchMeta,
  type BenchResult,
} from "./_bench.js";

type ScenarioName = "small" | "medium" | "large";
type BenchKey =
  | "flags"
  | "impulseQ"
  | "impulseQ_nonplain"
  | "registeredById"
  | "*";

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
    iters: parseEnvIters("RUNTIME_BENCH_ITERS_SMALL", 10_000),
  },
  medium: {
    flagsSize: 1000,
    impulseEntries: 50,
    registeredCount: 200,
    iters: parseEnvIters("RUNTIME_BENCH_ITERS_MEDIUM", 2000),
  },
  large: {
    flagsSize: 5000,
    impulseEntries: 500,
    registeredCount: 2000,
    iters: parseEnvIters("RUNTIME_BENCH_ITERS_LARGE", 200),
  },
};

const ALL_SCENARIOS = ["small", "medium", "large"] as const;
const DEFAULT_KEYS: BenchKey[] = [
  "flags",
  "impulseQ",
  "impulseQ_nonplain",
  "registeredById",
  "*",
];
const selectedScenarios = filterByEnv<ScenarioName>(
  process.env.RUNTIME_BENCH_SCENARIOS,
  ALL_SCENARIOS,
);
const selectedKeys = filterByEnv<BenchKey>(
  process.env.RUNTIME_BENCH_KEYS,
  DEFAULT_KEYS,
);

(shouldBench ? describe : describe.skip)("bench/get(as)", () => {
  for (const scenario of selectedScenarios) {
    it(`BENCH-GET-AS-01 (${scenario})`, () => {
      const plainRun = buildScenario(scenario, "plain");
      const nonPlainRun = buildScenario(scenario, "nonplain");
      const config = SCENARIOS[scenario];
      const results: BenchResult[] = [];

      for (const key of selectedKeys) {
        const run = key === "impulseQ_nonplain" ? nonPlainRun : plainRun;
        const runtimeKey = key === "impulseQ_nonplain" ? "impulseQ" : key;
        const keyLabel = key;

        results.push(
          runBenchWithMemDelta(
            `${scenario}:${keyLabel}:referenceRaw`,
            () => {
              const value = run.get(runtimeKey, { as: "reference" });
              void value;
            },
            { iters: config.iters },
          ),
        );

        results.push(
          runBenchWithMemDelta(
            `${scenario}:${keyLabel}:referenceReadonlyView`,
            () => {
              const value = readonlyView(
                run.get(runtimeKey, { as: "reference" }),
              );
              void value;
            },
            { iters: config.iters },
          ),
        );

        results.push(
          runBenchWithMemDelta(
            `${scenario}:${keyLabel}:snapshot`,
            () => {
              const value = run.get(runtimeKey, { as: "snapshot" });
              void value;
            },
            { iters: config.iters },
          ),
        );
      }

      let sink = 0;
      const accessIters = Math.max(10, Math.floor(config.iters / 4));

      if (selectedKeys.includes("flags")) {
        results.push(
          runBenchWithMemDelta(
            `${scenario}:flags:referenceRaw_access`,
            () => {
              const r = plainRun.get("flags", {
                as: "reference",
              }) as FlagsBenchView;
              sink += r.list.length;
              sink += r.map.k10 ? 1 : 0;
            },
            { iters: accessIters },
          ),
        );

        results.push(
          runBenchWithMemDelta(
            `${scenario}:flags:referenceReadonlyView_access`,
            () => {
              const rv = readonlyView(
                plainRun.get("flags", { as: "reference" }),
              ) as FlagsBenchView;
              sink += rv.list.length;
              sink += rv.map.k10 ? 1 : 0;
            },
            { iters: accessIters },
          ),
        );

        results.push(
          runBenchWithMemDelta(
            `${scenario}:flags:snapshot_access`,
            () => {
              const s = plainRun.get("flags", {
                as: "snapshot",
              }) as FlagsBenchView;
              sink += s.list.length;
              sink += s.map.k10 ? 1 : 0;
            },
            { iters: accessIters },
          ),
        );
      }

      expect(sink).toBeGreaterThanOrEqual(0);

      const meta: BenchMeta = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        date: new Date().toISOString(),
        scenario,
        benchVersion: "0.112.0",
        exposeGc: typeof globalThis.gc === "function",
      };

      printJson(results, meta);

      const sortedResults = [...results].sort((a, b) => {
        const [scenarioA, nameA] = splitBenchName(a.name);
        const [scenarioB, nameB] = splitBenchName(b.name);

        if (scenarioA === scenarioB) {
          return nameA.localeCompare(nameB);
        }

        return scenarioA.localeCompare(scenarioB);
      });

      for (const result of sortedResults) {
        const [, compactName] = splitBenchName(result.name);
        console.log(
          `${scenario} | ${compactName} | ${result.medianNsPerOp.toFixed(1)} | ${result.medianMs.toFixed(1)} | ${result.minMs.toFixed(1)}..${result.maxMs.toFixed(1)}`,
        );
      }
    });
  }
});

function runBenchWithMemDelta(
  name: string,
  fn: () => void,
  options?: { warmup?: number; iters?: number; repeats?: number },
): BenchResult {
  const m0 = mem();
  const result = benchCase(name, fn, options);
  const m1 = mem();

  return {
    ...result,
    memDelta: diffMem(m0, m1),
  };
}

function splitBenchName(name: string): [string, string] {
  const firstColon = name.indexOf(":");

  if (firstColon < 0) {
    return [name, name];
  }

  return [name.slice(0, firstColon), name.slice(firstColon + 1)];
}

function parseEnvIters(name: string, fallback: number): number {
  const raw = process.env[name];

  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function filterByEnv<T extends string>(
  value: string | undefined,
  all: readonly T[],
): T[] {
  if (value === undefined || value.trim() === "") {
    return [...all];
  }

  const selected = value
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is T => all.includes(part as T));

  return selected.length > 0 ? selected : [...all];
}

type PayloadMode = "plain" | "nonplain";

function buildScenario(name: ScenarioName, payloadMode: PayloadMode) {
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
      livePayload: buildPayload(name, i, payloadMode),
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

function buildPayload(
  name: ScenarioName,
  i: number,
  payloadMode: PayloadMode,
): Record<string, unknown> {
  if (payloadMode === "nonplain") {
    return {
      when: new Date("2020-01-01T00:00:00.000Z"),
      re: /a/g,
      url: new URL("https://example.com/?a=1"),
      idx: i,
      scenario: name,
    };
  }

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
