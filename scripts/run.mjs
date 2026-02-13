#!/usr/bin/env node
/**
 * @file scripts/run.mjs
 * @version 0.12.0
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Root orchestration CLI.
 * @description Manual on/off gating for active projects and project commands (root-owned orchestration).
 */

/**
 * Root orchestration CLI (manual activation gate; root owns commands).
 *
 * Goals:
 * - Multiple projects may be active concurrently.
 * - Only explicitly activated projects may be started (active-projects.*.yaml).
 * - Projects do NOT need to provide package.json scripts for dev/watch workflows.
 * - Root defines task commands via projects.*.yaml (explicit cwd + commands).
 *
 * Files (root):
 * - active-projects.base.yaml (committed)
 * - active-projects.local.yaml (optional, gitignored)
 * - projects.base.yaml (committed)
 * - projects.local.yaml (optional, gitignored)
 *
 * State (root):
 * - .runtime/pids/*.pid (PIDs for processes started by this CLI)
 *
 * Usage:
 *   node scripts/run.mjs status
 *   node scripts/run.mjs stop
 *   node scripts/run.mjs active <task>
 *   node scripts/run.mjs project <name> <task>
 *
 * Convenience aliases:
 *   node scripts/run.mjs dev
 *   node scripts/run.mjs watch
 *   node scripts/run.mjs test:watch
 *   node scripts/run.mjs build:watch
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const ROOT = process.cwd();

const ACTIVE_BASE_YAML = path.join(ROOT, "active-projects.base.yaml");
const ACTIVE_LOCAL_YAML = path.join(ROOT, "active-projects.local.yaml");

const PROJECTS_BASE_YAML = path.join(ROOT, "projects.base.yaml");
const PROJECTS_LOCAL_YAML = path.join(ROOT, "projects.local.yaml");

const RUNTIME_DIR = path.join(ROOT, ".runtime");
const PID_DIR = path.join(RUNTIME_DIR, "pids");
fs.mkdirSync(PID_DIR, { recursive: true });

// ------------------------------------------------------------
// Minimal YAML parsing helpers (strict, schema-specific)
// ------------------------------------------------------------
function stripComments(line) {
  // Keep inline # inside quotes untouched? For simplicity and robustness:
  // treat lines starting with # as comments; do not attempt inline comment stripping.
  const t = line.trim();
  if (t.startsWith("#")) return "";
  return line;
}

function normalizeLines(text) {
  return text
    .split(/\r?\n/)
    .map((l) => stripComments(l))
    .filter((l) => l !== "")
    .map((l) => l.replace(/\t/g, "  "))
    .map((l) => l.replace(/\s+$/g, ""));
}

function parseActiveProjectsYaml(yamlText) {
  const lines = normalizeLines(yamlText);

  let idx = lines.findIndex((l) => l.trim() === "active:" || l.trim().startsWith("active: "));
  if (idx === -1) return [];

  const first = lines[idx].trim();
  if (first.startsWith("active:")) {
    const rest = first.slice("active:".length).trim();
    if (rest === "[]") return [];
    if (rest) {
      throw new Error(
        `Unsupported YAML form near: "${first}". Use block list:\nactive:\n  - pkg`
      );
    }
  }

  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^[A-Za-z0-9_-]+:\s*$/.test(t) && !t.startsWith("-")) break;
    if (!t.startsWith("-")) continue;

    let v = t.replace(/^-+/, "").trim();
    v = v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").trim();
    if (v) out.push(v);
  }
  return out;
}

function parseProjectsYaml(yamlText) {
  // Expected schema:
  // projects:
  //   "<name>":
  //     cwd: "packages/xyz"
  //     tasks:
  //       watch: "cmd"
  //       test:watch: "cmd"
  const lines = normalizeLines(yamlText);

  const root = { projects: {} };

  const projectsIdx = lines.findIndex((l) => l.trim() === "projects:");
  if (projectsIdx === -1) return root;

  let i = projectsIdx + 1;

  function indentOf(line) {
    const m = line.match(/^\s*/);
    return m ? m[0].length : 0;
  }

  function unquote(s) {
    const t = s.trim();
    return t.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // new top-level key ends parsing
    if (indentOf(line) === 0 && line.trim().endsWith(":") && line.trim() !== "projects:") break;

    // project block begins at indent 2:   "<name>":
    if (indentOf(line) === 2 && line.trim().endsWith(":")) {
      const projectName = unquote(line.trim().slice(0, -1));
      const proj = { cwd: "", tasks: {} };
      i++;

      while (i < lines.length) {
        const l2 = lines[i];
        if (!l2.trim()) {
          i++;
          continue;
        }

        const ind2 = indentOf(l2);
        if (ind2 <= 2) break;

        // cwd: "..."
        if (ind2 === 4 && l2.trim().startsWith("cwd:")) {
          const v = l2.trim().slice("cwd:".length).trim();
          proj.cwd = unquote(v);
          i++;
          continue;
        }

        // tasks:
        if (ind2 === 4 && l2.trim() === "tasks:") {
          i++;
          while (i < lines.length) {
            const l3 = lines[i];
            if (!l3.trim()) {
              i++;
              continue;
            }
            const ind3 = indentOf(l3);
            if (ind3 <= 4) break;

            // task mapping at indent 6: key: "cmd"
            if (ind3 === 6) {
              const m = l3.trim().match(/^([^:]+):\s*(.*)$/);
              if (m) {
                const key = unquote(m[1]);
                const val = unquote(m[2] ?? "");
                if (key) proj.tasks[key] = val;
              }
            }
            i++;
          }
          continue;
        }

        // skip unknown nested keys to keep forward compatible
        i++;
      }

      root.projects[projectName] = proj;
      continue;
    }

    i++;
  }

  return root;
}

function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).filter(Boolean).sort();
}

function getActiveProjects() {
  const baseText = readTextIfExists(ACTIVE_BASE_YAML) ?? "";
  const localText = readTextIfExists(ACTIVE_LOCAL_YAML) ?? "";
  const base = baseText ? parseActiveProjectsYaml(baseText) : [];
  const local = localText ? parseActiveProjectsYaml(localText) : [];
  return uniqueSorted([...base, ...local]);
}

function getProjectRegistry() {
  const baseText = readTextIfExists(PROJECTS_BASE_YAML) ?? "";
  const localText = readTextIfExists(PROJECTS_LOCAL_YAML) ?? "";
  const base = baseText ? parseProjectsYaml(baseText) : { projects: {} };
  const local = localText ? parseProjectsYaml(localText) : { projects: {} };

  // Merge: local overrides base per project; tasks shallow-merged with local taking precedence.
  const projects = { ...(base.projects ?? {}) };
  for (const [name, p] of Object.entries(local.projects ?? {})) {
    const baseP = projects[name] ?? { cwd: "", tasks: {} };
    projects[name] = {
      cwd: p.cwd || baseP.cwd,
      tasks: { ...(baseP.tasks ?? {}), ...(p.tasks ?? {}) },
    };
  }
  return { projects };
}

// ------------------------------------------------------------
// PID management
// ------------------------------------------------------------
function pidFileName(project) {
  return `${project.replace(/[\/:@]/g, "_")}.pid`;
}

function pidPath(project) {
  return path.join(PID_DIR, pidFileName(project));
}

function writePid(project, pid) {
  fs.writeFileSync(pidPath(project), String(pid), "utf8");
}

function readPid(project) {
  const p = pidPath(project);
  if (!fs.existsSync(p)) return null;
  const n = Number(fs.readFileSync(p, "utf8"));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function clearPid(project) {
  const p = pidPath(project);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listPidEntries() {
  if (!fs.existsSync(PID_DIR)) return [];
  return fs
    .readdirSync(PID_DIR)
    .filter((f) => f.endsWith(".pid"))
    .map((f) => {
      const full = path.join(PID_DIR, f);
      const pid = Number(fs.readFileSync(full, "utf8"));
      return { file: f, pid: Number.isFinite(pid) ? pid : null, full };
    });
}

// ------------------------------------------------------------
// Command execution
// ------------------------------------------------------------
function spawnShellCommand(command, { cwd, label }) {
  // Use shell explicitly to keep command strings portable and readable in YAML.
  const child = spawn(command, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("error", (err) => {
    console.error(`[${label ?? "cmd"}] error:`, err);
  });

  return child;
}

function usage() {
  const active = getActiveProjects();
  return `
Root runner (manual activation gate; root owns commands)

Commands:
  status
  stop
  active <task>             Runs <task> for all active projects (parallel)
  project <name> <task>     Runs <task> for one active project

Aliases:
  dev         -> active dev
  watch       -> active watch
  test:watch  -> active test:watch
  build:watch -> active build:watch

Examples:
  node scripts/run.mjs status
  node scripts/run.mjs dev
  node scripts/run.mjs active watch
  node scripts/run.mjs project @einfach-design/runtime test:watch
  node scripts/run.mjs stop

Active projects:
  - ${active.join("\n  - ") || "(none)"}
`.trim();
}

function resolveTaskCommand(projectName, taskName, registry) {
  const p = registry.projects?.[projectName];
  if (!p) return null;
  const cmd = p.tasks?.[taskName];
  if (!cmd) return null;
  const cwd = p.cwd ? path.join(ROOT, p.cwd) : ROOT;
  return { command: cmd, cwd };
}

function assertProjectActive(project, active) {
  if (!active.includes(project)) {
    const hint =
      `Project is not active: ${project}\n` +
      `Activate it by adding it to active-projects.base.yaml (repo) or active-projects.local.yaml (local).\n` +
      `Currently active:\n  - ${active.join("\n  - ") || "(none)"}`;
    throw new Error(hint);
  }
}

async function cmdStatus() {
  const active = getActiveProjects();
  const registry = getProjectRegistry();
  const pidEntries = listPidEntries();

  console.log("Active projects:");
  if (active.length === 0) console.log("  (none)");
  for (const p of active) console.log(`  - ${p}`);

  console.log("\nProject registry (tasks available):");
  for (const p of active) {
    const reg = registry.projects?.[p];
    if (!reg) {
      console.log(`  - ${p}: (missing from projects.*.yaml)`);
      continue;
    }
    const tasks = Object.keys(reg.tasks ?? {}).sort();
    console.log(`  - ${p}: ${tasks.join(", ") || "(no tasks)"}`);
  }

  console.log("\nStarted by CLI (pids):");
  if (pidEntries.length === 0) {
    console.log("  (none)");
    return;
  }

  for (const e of pidEntries) {
    const alive = e.pid ? isPidAlive(e.pid) : false;
    console.log(`  - ${e.file}: ${e.pid ?? "?"} ${alive ? "(alive)" : "(dead)"}`);
    // Cleanup dead PIDs to avoid drift.
    if (!alive) {
      try {
        fs.unlinkSync(e.full);
      } catch {}
    }
  }
}

async function cmdStop() {
  const pidEntries = listPidEntries();
  if (pidEntries.length === 0) {
    console.log("No processes tracked by this CLI.");
    return;
  }

  // 1) SIGINT (graceful)
  for (const e of pidEntries) {
    if (!e.pid) continue;
    try {
      process.kill(e.pid, "SIGINT");
    } catch {}
  }

  await new Promise((r) => setTimeout(r, 900));

  // 2) SIGTERM (fallback)
  for (const e of pidEntries) {
    if (!e.pid) continue;
    try {
      if (isPidAlive(e.pid)) process.kill(e.pid, "SIGTERM");
    } catch {}
  }

  await new Promise((r) => setTimeout(r, 400));

  // Cleanup
  for (const e of pidEntries) {
    try {
      fs.unlinkSync(e.full);
    } catch {}
  }

  console.log("Stopped all processes tracked by this CLI.");
}

async function cmdActive(taskName) {
  const active = getActiveProjects();
  if (active.length === 0) {
    throw new Error(
      "No active projects. Activate at least one project in active-projects.base.yaml or active-projects.local.yaml."
    );
  }

  const registry = getProjectRegistry();

  for (const project of active) {
    const existing = readPid(project);
    if (existing && isPidAlive(existing)) {
      console.log(`[skip] ${project} already running (pid ${existing})`);
      continue;
    }

    const resolved = resolveTaskCommand(project, taskName, registry);
    if (!resolved) {
      throw new Error(
        `No task mapping for "${taskName}" in projects.*.yaml for project: ${project}`
      );
    }

    const child = spawnShellCommand(resolved.command, { cwd: resolved.cwd, label: project });
    writePid(project, child.pid);

    child.on("exit", () => clearPid(project));
    child.on("error", () => clearPid(project));
  }
}

async function cmdProject(project, taskName) {
  const active = getActiveProjects();
  assertProjectActive(project, active);

  const existing = readPid(project);
  if (existing && isPidAlive(existing)) {
    console.log(`[skip] ${project} already running (pid ${existing})`);
    return;
  }

  const registry = getProjectRegistry();
  const resolved = resolveTaskCommand(project, taskName, registry);
  if (!resolved) {
    throw new Error(`No task mapping for "${taskName}" in projects.*.yaml for project: ${project}`);
  }

  const child = spawnShellCommand(resolved.command, { cwd: resolved.cwd, label: project });
  writePid(project, child.pid);

  child.on("exit", () => clearPid(project));
  child.on("error", () => clearPid(project));
}

function normalizeAlias(arg0) {
  if (arg0 === "dev") return { cmd: "active", args: ["dev"] };
  if (arg0 === "watch") return { cmd: "active", args: ["watch"] };
  if (arg0 === "test:watch") return { cmd: "active", args: ["test:watch"] };
  if (arg0 === "build:watch") return { cmd: "active", args: ["build:watch"] };
  return { cmd: arg0, args: [] };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.log(usage());
    process.exit(1);
  }

  const { cmd, args } = normalizeAlias(argv[0]);
  const rest = [...args, ...argv.slice(1)];

  try {
    if (cmd === "status") return await cmdStatus();
    if (cmd === "stop") return await cmdStop();
    if (cmd === "active") {
      const taskName = rest[0];
      if (!taskName) throw new Error("Missing task name.\n\n" + usage());
      return await cmdActive(taskName);
    }
    if (cmd === "project") {
      const project = rest[0];
      const taskName = rest[1];
      if (!project || !taskName) throw new Error("Missing args.\n\n" + usage());
      return await cmdProject(project, taskName);
    }

    throw new Error(`Unknown command: ${cmd}\n\n` + usage());
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}

await main();
