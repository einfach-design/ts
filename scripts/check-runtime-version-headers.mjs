#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

const pkg = JSON.parse(read("packages/runtime/package.json"));
const version = pkg.version;

const checks = [
  {
    file: "packages/runtime/README.md",
    label: "README frontmatter version",
    test: (content) =>
      new RegExp(String.raw`^version:\s*${version}$`, "m").test(content),
  },
  {
    file: ".github/workflows/runtime.yaml",
    label: "Workflow header version",
    test: (content) =>
      new RegExp(String.raw`^# version:\s*${version}$`, "m").test(content),
  },
  {
    file: `docs/runtime/RunTime-${version}-Specification.md`,
    label: "Specification filename by package version",
    test: (content) => {
      const fmOk = new RegExp(String.raw`^version:\s*${version}$`, "m").test(
        content,
      );
      const titleOk = new RegExp(
        String.raw`^# RunTime ${version} – Specification`,
        "m",
      ).test(content);
      return fmOk && titleOk;
    },
  },
];

for (const check of checks) {
  let content = "";
  try {
    content = read(check.file);
  } catch {
    fail(`${check.label}: file missing (${check.file}).`);
    continue;
  }

  if (!check.test(content)) {
    fail(`${check.label}: expected version ${version} in ${check.file}.`);
  } else {
    console.log(`✅ ${check.label}: ${check.file}`);
  }
}

if (!process.exitCode) {
  console.log(
    `\nAll runtime header versions are consistent with packages/runtime/package.json (${version}).`,
  );
}
