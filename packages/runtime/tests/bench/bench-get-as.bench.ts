import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { readonlyView } from "../../src/runtime/util.js";
import {
  benchCase,
  diffMem,
  mem,
  printJson,
  toJson,
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
const benchBaseline = process.env.RUNTIME_BENCH_BASELINE;
const benchOut = process.env.RUNTIME_BENCH_OUT;

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
      const memBefore = mem();
      const results: BenchResult[] = [];

      for (const key of selectedKeys) {
        const run = key === "impulseQ_nonplain" ? nonPlainRun : plainRun;
        const runtimeKey = key === "impulseQ_nonplain" ? "impulseQ" : key;
        const keyLabel = key;

        results.push(
          runBenchWithMemDelta(
            `${scenario}:${keyLabel}:referenceRaw`,
            () => {
              const value =
                runtimeKey === "*"
                  ? run.get("*", { as: "reference" })
                  : run.get(runtimeKey, { as: "reference" });
              void value;
            },
            { iters: config.iters },
          ),
        );

        results.push(
          runBenchWithMemDelta(
            `${scenario}:${keyLabel}:referenceReadonlyView`,
            () => {
              const value =
                runtimeKey === "*"
                  ? readonlyView(run.get("*", { as: "reference" }))
                  : readonlyView(run.get(runtimeKey, { as: "reference" }));
              void value;
            },
            { iters: config.iters },
          ),
        );

        results.push(
          runBenchWithMemDelta(
            `${scenario}:${keyLabel}:snapshot`,
            () => {
              const value =
                runtimeKey === "*"
                  ? run.get("*", { as: "snapshot" })
                  : run.get(runtimeKey, { as: "snapshot" });
              void value;
            },
            { iters: config.iters },
          ),
        );
      }

      let sink = 0;
      const accessIters = Math.max(10, Math.floor(config.iters / 4));

      if (selectedKeys.includes("flags")) {
        let referenceRawAccessIdx = 0;
        let referenceReadonlyViewAccessIdx = 0;
        let snapshotAccessIdx = 0;

        results.push(
          runBenchWithMemDelta(
            `${scenario}:flags:referenceRaw_access`,
            () => {
              const r = plainRun.get("flags", {
                as: "reference",
              }) as FlagsBenchView;
              sink += r.list.length;
              const idx =
                referenceRawAccessIdx % (scenario === "small" ? 16 : 256);
              referenceRawAccessIdx += 1;
              sink += r.map[`k${idx}`] ? 1 : 0;
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
              const idx =
                referenceReadonlyViewAccessIdx %
                (scenario === "small" ? 16 : 256);
              referenceReadonlyViewAccessIdx += 1;
              sink += rv.map[`k${idx}`] ? 1 : 0;
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
              const idx = snapshotAccessIdx % (scenario === "small" ? 16 : 256);
              snapshotAccessIdx += 1;
              sink += s.map[`k${idx}`] ? 1 : 0;
            },
            { iters: accessIters },
          ),
        );
      }

      expect(sink).toBeGreaterThanOrEqual(0);

      applyRatioMetrics(results);
      applyBaselineDelta(results, benchBaseline);

      const memAfter = mem();
      const meta: BenchMeta = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        date: new Date().toISOString(),
        runId: `${scenario}-${Date.now()}`,
        scenario,
        benchVersion: "0.114.0",
        exposeGc: typeof globalThis.gc === "function",
        memBefore,
        memAfter,
        env: {
          benchScenarios: process.env.RUNTIME_BENCH_SCENARIOS,
          benchKeys: process.env.RUNTIME_BENCH_KEYS,
          itersSmall: process.env.RUNTIME_BENCH_ITERS_SMALL,
          itersMedium: process.env.RUNTIME_BENCH_ITERS_MEDIUM,
          itersLarge: process.env.RUNTIME_BENCH_ITERS_LARGE,
          benchOut,
          benchBaseline,
        },
      };

      const json = toJson(results, meta);
      printJson(results, meta);

      if (benchOut !== undefined && benchOut.trim() !== "") {
        try {
          mkdirSync(dirname(benchOut), { recursive: true });
          writeFileSync(benchOut, json, { encoding: "utf8" });
        } catch (error) {
          console.log(
            `[bench/get(as)] warning: failed writing bench output (${benchOut}): ${String(error)}`,
          );
        }
      }

      const sortedResults = [...results].sort(compareBenchResults);

      for (const result of sortedResults) {
        console.log(
          `${result.scenario ?? "-"} | ${result.key ?? "-"} | ${result.mode ?? "-"} | ${result.medianNsPerOp.toFixed(1)} | ${formatRatio(result.ratioToRef)} | ${formatRatio(result.ratioToSnapshot)} | ${formatDeltaPct(result.deltaPct)} | ${formatHeapDelta(result.memDelta?.heapUsed)}`,
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
  const { scenario, key, mode } = parseName(name);
  const m0 = mem();
  const result = benchCase(name, fn, options);
  const m1 = mem();

  return {
    ...result,
    scenario,
    key,
    mode,
    memDelta: diffMem(m0, m1),
  };
}

function parseName(name: string): {
  scenario: string;
  key: string;
  mode: string;
} {
  const [scenario, key, mode, ...rest] = name.split(":");

  if (
    scenario === undefined ||
    key === undefined ||
    mode === undefined ||
    rest.length > 0
  ) {
    throw new Error(
      `Invalid bench name format: ${name}. Expected <scenario>:<key>:<mode>.`,
    );
  }

  return { scenario, key, mode };
}

function applyRatioMetrics(results: BenchResult[]): void {
  const grouped = new Map<string, BenchResult[]>();

  for (const result of results) {
    if (result.scenario === undefined || result.key === undefined) {
      continue;
    }

    const groupKey = `${result.scenario}:${result.key}`;
    const existing = grouped.get(groupKey);

    if (existing === undefined) {
      grouped.set(groupKey, [result]);
      continue;
    }

    existing.push(result);
  }

  for (const groupResults of grouped.values()) {
    const referenceRaw = groupResults.find(
      (result) => result.mode === "referenceRaw",
    );
    const snapshot = groupResults.find((result) => result.mode === "snapshot");

    if (referenceRaw !== undefined) {
      referenceRaw.ratioToRef = 1;
    }

    if (snapshot !== undefined) {
      snapshot.ratioToSnapshot = 1;
    }

    for (const result of groupResults) {
      if (referenceRaw !== undefined && result !== referenceRaw) {
        result.ratioToRef = result.medianNsPerOp / referenceRaw.medianNsPerOp;
      }

      if (snapshot !== undefined && result !== snapshot) {
        result.ratioToSnapshot = result.medianNsPerOp / snapshot.medianNsPerOp;
      }
    }
  }
}

function applyBaselineDelta(
  results: BenchResult[],
  baselinePath: string | undefined,
): void {
  if (baselinePath === undefined || baselinePath.trim() === "") {
    return;
  }

  let baselineResults: BenchResult[] = [];

  try {
    const baselineRaw = readFileSync(baselinePath, { encoding: "utf8" });
    const baselineData = JSON.parse(baselineRaw) as { results?: BenchResult[] };
    baselineResults = baselineData.results ?? [];
  } catch (error) {
    console.log(
      `[bench/get(as)] warning: failed reading/parsing baseline (${baselinePath}): ${String(error)}`,
    );
    return;
  }

  const baselineByName = new Map(
    baselineResults.map((result) => [result.name, result] as const),
  );
  const tupleEntries: [string, BenchResult][] = [];

  for (const result of baselineResults) {
    const parsed = parseNameOrUndefined(result.name);

    if (parsed === undefined) {
      continue;
    }

    tupleEntries.push([
      `${parsed.scenario}:${parsed.key}:${parsed.mode}`,
      result,
    ]);
  }

  const baselineByTuple = new Map<string, BenchResult>(tupleEntries);

  for (const result of results) {
    const tupleKey = `${result.scenario ?? ""}:${result.key ?? ""}:${result.mode ?? ""}`;
    const baseline =
      baselineByName.get(result.name) ?? baselineByTuple.get(tupleKey);

    if (baseline === undefined) {
      continue;
    }

    result.deltaPct = (result.medianNsPerOp / baseline.medianNsPerOp - 1) * 100;
  }
}

function parseNameOrUndefined(name: string):
  | {
      scenario: string;
      key: string;
      mode: string;
    }
  | undefined {
  try {
    return parseName(name);
  } catch {
    return undefined;
  }
}

function compareBenchResults(a: BenchResult, b: BenchResult): number {
  const scenarioCompare = (a.scenario ?? "").localeCompare(b.scenario ?? "");

  if (scenarioCompare !== 0) {
    return scenarioCompare;
  }

  const keyCompare = (a.key ?? "").localeCompare(b.key ?? "");

  if (keyCompare !== 0) {
    return keyCompare;
  }

  const modeRankDiff = modeRank(a.mode) - modeRank(b.mode);

  if (modeRankDiff !== 0) {
    return modeRankDiff;
  }

  return (a.mode ?? "").localeCompare(b.mode ?? "");
}

function modeRank(mode: string | undefined): number {
  if (mode === "referenceRaw") {
    return 0;
  }

  if (mode === "referenceReadonlyView") {
    return 1;
  }

  if (mode === "snapshot") {
    return 2;
  }

  if (mode === "referenceRaw_access") {
    return 3;
  }

  if (mode === "referenceReadonlyView_access") {
    return 4;
  }

  if (mode === "snapshot_access") {
    return 5;
  }

  return 10;
}

function formatRatio(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return value.toFixed(2);
}

function formatDeltaPct(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatHeapDelta(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  if (Math.abs(value) < 1024) {
    return `${value} B`;
  }

  if (Math.abs(value) < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
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
