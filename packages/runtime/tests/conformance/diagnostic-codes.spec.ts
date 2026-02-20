/**
 * @file packages/runtime/tests/conformance/diagnostic-codes.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Deterministic diagnostic registry and source-scan gates.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { DIAGNOSTIC_CODES } from "../../src/diagnostics/index.js";

describe("conformance/diagnostic-codes", () => {
  it("registry schema guard: each DIAGNOSTIC_CODES key is exactly a.b.c", () => {
    for (const code of Object.keys(DIAGNOSTIC_CODES)) {
      expect(code).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
      expect(code.split(".")).toHaveLength(3);
    }
  });

  it("source-scan gate: all emit({ code }) values are registered", () => {
    const runtimeSourceRoot = resolve(process.cwd(), "src");
    const knownCodes = new Set(Object.keys(DIAGNOSTIC_CODES));

    const walkTsFiles = (directory: string): string[] => {
      const entries = readdirSync(directory).sort((left, right) =>
        left.localeCompare(right),
      );
      const files: string[] = [];

      for (const entry of entries) {
        const absolutePath = resolve(directory, entry);
        const stats = statSync(absolutePath);

        if (stats.isDirectory()) {
          files.push(...walkTsFiles(absolutePath));
          continue;
        }

        if (stats.isFile() && absolutePath.endsWith(".ts")) {
          files.push(absolutePath);
        }
      }

      return files;
    };

    const emittedCodes: Array<{ file: string; code: string }> = [];
    for (const absolutePath of walkTsFiles(runtimeSourceRoot)) {
      const source = readFileSync(absolutePath, "utf8");
      const matches = source.matchAll(/emit\(\s*\{[\s\S]*?code:\s*"([^"]+)"/g);

      for (const match of matches) {
        const code = match[1];
        if (code === undefined) {
          continue;
        }

        emittedCodes.push({
          file: relative(process.cwd(), absolutePath),
          code,
        });
      }
    }

    emittedCodes.sort((left, right) => {
      const fileOrder = left.file.localeCompare(right.file);
      if (fileOrder !== 0) {
        return fileOrder;
      }

      return left.code.localeCompare(right.code);
    });

    for (const emission of emittedCodes) {
      expect(
        knownCodes.has(emission.code),
        `${emission.file} -> ${emission.code}`,
      ).toBe(true);
    }
  });
});
