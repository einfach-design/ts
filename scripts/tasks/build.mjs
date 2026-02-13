#!/usr/bin/env node
/**
 * @file scripts/tasks/build.mjs
 * @version 0.15.0
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Root-owned task implementation (generic, parametrizable).
 * @description Generic build/watch runner that does not rely on package.json scripts.
 *
 * Why this exists:
 * - Root owns orchestration and can invoke build tasks without requiring packages to define scripts.
 * - Projects may use different tools/outDirs; this runner is configured via CLI args.
 *
 * Supported tools:
 * - tsup (default)
 * - vitest (as a long-running watch/test loop)
 * - tsc (basic build)
 *
 * Usage examples:
 * - Build (clean + tsup):
 *     node scripts/tasks/build.mjs --cwd packages/runtime --tool tsup --outDir dist --clean
 *
 * - Watch (tsup --watch):
 *     node scripts/tasks/build.mjs --cwd packages/runtime --tool tsup --outDir dist --watch
 *
 * - Pass through extra args (after --):
 *     node scripts/tasks/build.mjs --cwd packages/runtime --tool tsup --outDir dist -- --minify
 */

import { spawn } from "node:child_process";
import process from "node:process";

function usage() {
  return `
Generic build/watch runner (root-owned)

Required:
  --cwd <path>          Working directory of the project (e.g. packages/runtime)

Optional:
  --tool <name>         Tool to run via pnpm exec (default: tsup)
  --outDir <dir>        Directory to clean (default: dist)
  --clean               Clean outDir before running (default: false)
  --watch               Run tool in watch mode (tool-specific; adds --watch for tsup/tsc)
  --label <string>      Log label (default: <tool>@<cwd>)
  --                    Everything after -- is passed through to the tool

Examples:
  node scripts/tasks/build.mjs --cwd packages/runtime --tool tsup --outDir dist --clean
  node scripts/tasks/build.mjs --cwd packages/runtime --tool tsup --outDir dist --watch -- --minify
`.trim();
}

function parseArgs(argv) {
  const args = { cwd: null, tool: "tsup", outDir: "dist", clean: false, watch: false, label: null, passthrough: [] };

  const dd = argv.indexOf("--");
  const main = dd >= 0 ? argv.slice(0, dd) : argv;
  args.passthrough = dd >= 0 ? argv.slice(dd + 1) : [];

  for (let i = 0; i < main.length; i++) {
    const a = main[i];
    if (a === "--cwd") args.cwd = main[++i];
    else if (a === "--tool") args.tool = main[++i];
    else if (a === "--outDir") args.outDir = main[++i];
    else if (a === "--label") args.label = main[++i];
    else if (a === "--clean") args.clean = true;
    else if (a === "--watch") args.watch = true;
    else if (a === "-h" || a === "--help") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}\n\n${usage()}`);
    }
  }

  if (!args.cwd) throw new Error(`Missing required --cwd\n\n${usage()}`);
  return args;
}

function runPnpmExec({ cwd, label }, bin, binArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["-C", cwd, "exec", bin, ...binArgs],
      { stdio: "inherit", shell: process.platform === "win32", env: process.env }
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`[${label}] failed with exit code ${code}`));
    });
  });
}

function toolArgs(tool, watch, passthrough) {
  // Keep this intentionally conservative; projects can always bypass this runner
  // by specifying a raw command in projects.base.yaml.
  if (tool === "tsup") return [...(watch ? ["--watch"] : []), ...passthrough];
  if (tool === "tsc") return [...(watch ? ["--watch"] : []), ...passthrough];
  if (tool === "vitest") return [...(watch ? ["--watch"] : []), ...passthrough];
  return [...passthrough];
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const label = cfg.label ?? `${cfg.tool}@${cfg.cwd}`;

  if (cfg.clean) {
    // Clean is intentionally an explicit opt-in (avoids accidentally deleting the wrong directory).
    await runPnpmExec({ cwd: cfg.cwd, label: `${label}:clean` }, "rimraf", [cfg.outDir]);
  }

  await runPnpmExec({ cwd: cfg.cwd, label }, cfg.tool, toolArgs(cfg.tool, cfg.watch, cfg.passthrough));
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
