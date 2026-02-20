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
import { createRuntime } from "../../src/index.js";

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

  it("emits set.impulseQ.retainInvalid and throws for NaN retain", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { retain: Number.NaN } } }),
    ).toThrow("set.impulseQ.retainInvalid");
    expect(codes).toContain("set.impulseQ.retainInvalid");
  });

  it("emits set.impulseQ.maxBytesInvalid and throws for NaN maxBytes", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { maxBytes: Number.NaN } } }),
    ).toThrow("set.impulseQ.maxBytesInvalid");
    expect(codes).toContain("set.impulseQ.maxBytesInvalid");
  });

  it("emits set.impulseQ.onTrimInvalid and throws for invalid onTrim patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ impulseQ: { config: { onTrim: 123 } } } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow("set.impulseQ.onTrimInvalid");
    expect(codes).toContain("set.impulseQ.onTrimInvalid");
  });

  it("emits set.impulseQ.onErrorInvalid and throws for invalid onError patch", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({
        impulseQ: { config: { onError: "banana" } },
      } as unknown as Record<string, unknown>),
    ).toThrow("set.impulseQ.onErrorInvalid");
    expect(codes).toContain("set.impulseQ.onErrorInvalid");
  });

  it("emits set.impulseQ.qInvalid and throws for hydration with out-of-range cursor", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const impulseQ = snapshot.impulseQ as { q: { cursor: number } };
    impulseQ.q.cursor = 999;

    expect(() => run.set(snapshot)).toThrow("set.impulseQ.qInvalid");
    expect(codes).toContain("set.impulseQ.qInvalid");
  });

  it("emits set.impulseQ.entryInvalid and throws for hydration with invalid entry", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const impulseQ = snapshot.impulseQ as {
      q: { entries: unknown[]; cursor: number };
    };
    impulseQ.q.entries = [{ signals: "nope" }];
    impulseQ.q.cursor = 1;

    expect(() => run.set(snapshot)).toThrow("set.impulseQ.entryInvalid");
    expect(codes).toContain("set.impulseQ.entryInvalid");
  });

  it("emits set.hydration.incomplete and throws for incomplete hydration patches", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    const snapshot = run.get("*", { as: "snapshot" }) as Record<
      string,
      unknown
    >;
    const incompleteHydration = { ...snapshot };
    delete incompleteHydration.flags;

    expect(() => run.set(incompleteHydration)).toThrow(
      "set.hydration.incomplete",
    );
    expect(codes).toContain("set.hydration.incomplete");
  });

  it("emits set.flags.invalid and throws for invalid flags payload", () => {
    const run = createRuntime();
    const codes: string[] = [];

    run.onDiagnostic((diagnostic) => {
      codes.push(diagnostic.code);
    });

    expect(() =>
      run.set({ flags: ["x"] as unknown as { list: string[] } }),
    ).toThrow("set.flags.invalid");
    expect(codes).toContain("set.flags.invalid");
  });
});
