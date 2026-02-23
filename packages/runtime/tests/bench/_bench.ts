import { performance as nodePerformance } from "node:perf_hooks";

export type BenchResult = {
  name: string;
  iters: number;
  ms: number;
  nsPerOp: number;
};

export type BenchMeta = {
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  date: string;
  scenario?: "small" | "medium" | "large";
};

export function now(): number {
  if (typeof globalThis.performance !== "undefined") {
    return globalThis.performance.now();
  }

  return nodePerformance.now();
}

export function benchCase(
  name: string,
  fn: () => void,
  options?: { warmup?: number; iters?: number },
): BenchResult {
  const warmup = options?.warmup ?? 500;
  const iters = options?.iters ?? 2000;

  for (let i = 0; i < warmup; i += 1) {
    fn();
  }

  const t0 = now();
  for (let i = 0; i < iters; i += 1) {
    fn();
  }
  const t1 = now();

  const ms = t1 - t0;

  return {
    name,
    iters,
    ms,
    nsPerOp: (ms * 1_000_000) / iters,
  };
}

export function printJson(results: BenchResult[], meta: BenchMeta): void {
  console.log(JSON.stringify({ meta, results }, null, 2));
}
