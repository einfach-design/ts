import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Resolves absolute paths independent of process.cwd().
 * RUNTIME_PKG_ROOT points to: packages/runtime
 */
export const RUNTIME_PKG_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..", // tests
  "..", // runtime
);

export const fromRuntimePkgRoot = (...segments: string[]) =>
  resolve(RUNTIME_PKG_ROOT, ...segments);
