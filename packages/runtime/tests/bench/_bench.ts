import { performance as nodePerformance } from "node:perf_hooks";

export type BenchResult = {
  name: string;
  scenario?: string;
  key?: string;
  mode?: string;
  iters: number;
  repeats: number;
  ms: number;
  nsPerOp: number;
  minMs: number;
  maxMs: number;
  medianMs: number;
  medianNsPerOp: number;
  ratioToRef?: number;
  ratioToSnapshot?: number;
  deltaPct?: number;
  memDelta?: BenchMemory;
};

export type BenchMemory = {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
};

export type BenchMeta = {
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  date: string;
  runId?: string;
  scenario?: "small" | "medium" | "large";
  benchVersion?: string;
  exposeGc?: boolean;
  memBefore?: BenchMemory;
  memAfter?: BenchMemory;
  env?: {
    benchScenarios?: string | undefined;
    benchKeys?: string | undefined;
    itersSmall?: string | undefined;
    itersMedium?: string | undefined;
    itersLarge?: string | undefined;
    benchOut?: string | undefined;
    benchBaseline?: string | undefined;
  };
};

export function now(): number {
  if (typeof globalThis.performance !== "undefined") {
    return globalThis.performance.now();
  }

  return nodePerformance.now();
}

export function maybeGC(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

export function mem(): BenchMemory {
  const { rss, heapUsed, heapTotal, external } = process.memoryUsage();

  return { rss, heapUsed, heapTotal, external };
}

export function diffMem(a: BenchMemory, b: BenchMemory): BenchMemory {
  return {
    rss: b.rss - a.rss,
    heapUsed: b.heapUsed - a.heapUsed,
    heapTotal: b.heapTotal - a.heapTotal,
    external: b.external - a.external,
  };
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  return sorted[mid]!;
}

export function benchCase(
  name: string,
  fn: () => void,
  options?: { warmup?: number; iters?: number; repeats?: number },
): BenchResult {
  const warmup = options?.warmup ?? 500;
  const iters = options?.iters ?? 2000;
  const repeats = options?.repeats ?? 5;

  for (let i = 0; i < warmup; i += 1) {
    fn();
  }

  maybeGC();

  const runs: number[] = [];

  for (let repeat = 0; repeat < repeats; repeat += 1) {
    maybeGC();

    const t0 = now();
    for (let i = 0; i < iters; i += 1) {
      fn();
    }
    const t1 = now();
    runs.push(t1 - t0);
  }

  const minMs = Math.min(...runs);
  const maxMs = Math.max(...runs);
  const medianMs = median(runs);
  const medianNsPerOp = (medianMs * 1_000_000) / iters;

  return {
    name,
    iters,
    repeats,
    ms: medianMs,
    nsPerOp: medianNsPerOp,
    minMs,
    maxMs,
    medianMs,
    medianNsPerOp,
  };
}

export function toJson(results: BenchResult[], meta: BenchMeta): string {
  return JSON.stringify({ meta, results }, null, 2);
}

export function printJson(results: BenchResult[], meta: BenchMeta): void {
  console.log(toJson(results, meta));
}
