/**
 * @file packages/runtime/tests/conformance/diagnostic-codes.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance smoke tests for stable diagnostic codes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { DIAGNOSTIC_CODES } from "../../src/diagnostics/index.js";

describe("conformance/diagnostic-codes", () => {
  it("all DIAGNOSTIC_CODES use exactly 3 segments (a.b.c)", () => {
    for (const code of Object.keys(DIAGNOSTIC_CODES)) {
      expect(code).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
      expect(code.split(".")).toHaveLength(3);
    }
  });

  it("all emitted diagnostic codes in runtime sources are registered", () => {
    const runtimeSourceRoot = resolve(process.cwd(), "src");
    const knownCodes = new Set(Object.keys(DIAGNOSTIC_CODES));

    const listRuntimeSourceFiles = (directory: string): string[] => {
      const entries = readdirSync(directory, { withFileTypes: true }).sort(
        (left, right) => left.name.localeCompare(right.name),
      );
      const files: string[] = [];

      for (const entry of entries) {
        const absolutePath = resolve(directory, entry.name);

        if (entry.isDirectory()) {
          files.push(...listRuntimeSourceFiles(absolutePath));
          continue;
        }

        if (entry.isSymbolicLink()) {
          const stats = statSync(absolutePath);
          if (stats.isDirectory()) {
            files.push(...listRuntimeSourceFiles(absolutePath));
            continue;
          }
        }

        if (entry.isFile() && absolutePath.endsWith(".ts")) {
          files.push(absolutePath);
        }
      }

      return files;
    };

    const files = listRuntimeSourceFiles(runtimeSourceRoot).sort((a, b) =>
      a.localeCompare(b),
    );

    for (const absolutePath of files) {
      const source = readFileSync(absolutePath, "utf8");
      const relativePath = absolutePath.replace(`${process.cwd()}/`, "");
      const emitMatches = [...source.matchAll(/code:\s*"([^"]+)"/g)].sort(
        (left, right) => (left.index ?? 0) - (right.index ?? 0),
      );

      for (const match of emitMatches) {
        const code = match[1];
        if (code === undefined) {
          continue;
        }

        expect(knownCodes.has(code), `${relativePath} -> ${code}`).toBe(true);
      }
    }
  });
});
