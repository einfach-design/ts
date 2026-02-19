/**
 * @file packages/runtime/tests/conformance/diagnostic-codes.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance smoke tests for stable diagnostic codes.
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { DIAGNOSTIC_CODES } from "../../src/diagnostics/index.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

describe("conformance/diagnostic-codes", () => {
  it("emits set.hydration.incomplete on incomplete hydration patch", () => {
    const run = createRuntime();

    expect(() =>
      run.set({
        defaults: run.get("defaults") as Record<string, unknown>,
        flags: run.get("flags") as Record<string, unknown>,
        changedFlags: run.get("changedFlags") as Record<string, unknown>,
        seenFlags: run.get("seenFlags") as Record<string, unknown>,
        signal: run.get("signal") as string | undefined,
        impulseQ: run.get("impulseQ") as Record<string, unknown>,
        backfillQ: run.get("backfillQ") as Record<string, unknown>,
      }),
    ).toThrow("set.hydration.incomplete");

    const diagnostics = run.get("diagnostics") as Array<{ code: string }>;
    expect(
      diagnostics.some((entry) => entry.code === "set.hydration.incomplete"),
    ).toBe(true);
  });

  it("emits set.patch.forbidden for forbidden set keys", () => {
    const run = createRuntime();

    expect(() => run.set({ signal: "forbidden" })).toThrow(
      "set.patch.forbidden",
    );

    const diagnostics = run.get("diagnostics") as Array<{ code: string }>;
    expect(
      diagnostics.some((entry) => entry.code === "set.patch.forbidden"),
    ).toBe(true);
  });

  it("emits set.patch.invalid for non-object set patch", () => {
    const run = createRuntime();

    expect(() => run.set(null as unknown as Record<string, unknown>)).toThrow(
      "set.patch.invalid",
    );

    const diagnostics = run.get("diagnostics") as Array<{
      code: string;
      data?: { valueType?: string };
    }>;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "set.patch.invalid",
        data: expect.objectContaining({ valueType: "null" }),
      }),
    );
  });

  it("emits set.flags.addRemoveConflict for conflicting flag patch forms", () => {
    const run = createRuntime();

    expect(() =>
      run.set({
        flags: { list: ["a"], map: { a: true } },
        addFlags: ["b"],
      }),
    ).toThrow("set.flags.addRemoveConflict");

    const diagnostics = run.get("diagnostics") as Array<{ code: string }>;
    expect(
      diagnostics.some((entry) => entry.code === "set.flags.addRemoveConflict"),
    ).toBe(true);
  });

  it("emits set.flags.invalid for invalid flags patch shape", () => {
    const run = createRuntime();

    expect(() =>
      run.set({
        flags: { list: "nope", map: [] } as unknown as Record<string, unknown>,
      }),
    ).toThrow("set.flags.invalid");

    const diagnostics = run.get("diagnostics") as Array<{
      code: string;
      data?: { valueType?: string; hasList?: boolean; hasMap?: boolean };
    }>;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "set.flags.invalid",
        data: expect.objectContaining({
          valueType: "object",
          hasList: false,
          hasMap: true,
        }),
      }),
    );
  });

  it("emits set.impulseQ.invalid for invalid impulseQ patch", () => {
    const run = createRuntime();

    expect(() =>
      run.set({
        impulseQ: 123 as unknown as object,
      }),
    ).toThrow("set.impulseQ.invalid");

    const diagnostics = run.get("diagnostics") as Array<{
      code: string;
      data?: { valueType?: string };
    }>;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "set.impulseQ.invalid",
        data: expect.objectContaining({ valueType: "number" }),
      }),
    );
  });

  it("emits set.impulseQ.qForbidden for impulseQ q patch", () => {
    const run = createRuntime();

    expect(() =>
      run.set({
        impulseQ: {
          q: { entries: [], cursor: 0 },
        } as unknown as object,
      }),
    ).toThrow("set.impulseQ.qForbidden");

    const diagnostics = run.get("diagnostics") as Array<{
      code: string;
      data?: { field?: string };
    }>;

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "set.impulseQ.qForbidden",
        data: expect.objectContaining({ field: "q" }),
      }),
    );
  });

  it("emits add.target.required when no target is provided", () => {
    const run = createRuntime();

    expect(() => run.add({ id: "expr:no-target" })).toThrow(
      "add.target.required",
    );

    const diagnostics = run.get("diagnostics") as Array<{ code: string }>;
    expect(
      diagnostics.some((entry) => entry.code === "add.target.required"),
    ).toBe(true);
  });

  it("emits get.key.invalid with the rejected key", () => {
    const run = createRuntime();

    expect(() => run.get("unknown-key")).toThrow("get.key.invalid");

    const diagnostics = run.get("diagnostics") as Array<{
      code: string;
      data?: { key?: string };
    }>;

    const invalidGet = diagnostics.find(
      (entry) => entry.code === "get.key.invalid",
    );
    expect(invalidGet).toBeTruthy();
    expect(invalidGet?.data?.key).toBe("unknown-key");
  });

  it("emits runtime.diagnostic.listenerError when a diagnostic listener throws", () => {
    const run = createRuntime();
    const seen: string[] = [];

    run.onDiagnostic((diagnostic) => {
      seen.push(diagnostic.code);
    });

    run.onDiagnostic(() => {
      throw new Error("listener boom");
    });

    expect(() => run.get("unknown-key")).toThrow("get.key.invalid");

    expect(seen).toContain("runtime.diagnostic.listenerError");
  });

  it("emits add.objectTarget.* diagnostics for invalid object targets", () => {
    const missingEntrypoint = createRuntime();
    expect(() =>
      missingEntrypoint.add({
        id: "expr:missing-on",
        signal: "foo",
        targets: [{} as { on: Record<string, unknown> }],
      }),
    ).toThrow("add.objectTarget.missingEntrypoint");

    expect(
      (missingEntrypoint.get("diagnostics") as Array<{ code: string }>).some(
        (entry) => entry.code === "add.objectTarget.missingEntrypoint",
      ),
    ).toBe(true);

    const missingHandler = createRuntime();
    expect(() =>
      missingHandler.add({
        id: "expr:missing-handler",
        signal: "foo",
        targets: [{ on: {} }],
      }),
    ).toThrow("add.objectTarget.missingHandler");

    expect(
      (missingHandler.get("diagnostics") as Array<{ code: string }>).some(
        (entry) => entry.code === "add.objectTarget.missingHandler",
      ),
    ).toBe(true);

    const nonCallable = createRuntime();
    expect(() =>
      nonCallable.add({
        id: "expr:non-callable-handler",
        signal: "foo",
        targets: [{ on: { foo: "nope" } }],
      }),
    ).toThrow("add.objectTarget.nonCallableHandler");

    expect(
      (nonCallable.get("diagnostics") as Array<{ code: string }>).some(
        (entry) => entry.code === "add.objectTarget.nonCallableHandler",
      ),
    ).toBe(true);
  });

  it("uses only registered diagnostic codes in runtime emits", () => {
    const run = createRuntime();
    const seenCodes = new Set<string>();

    run.onDiagnostic((diagnostic) => {
      seenCodes.add(diagnostic.code);
    });

    expect(() => run.set(null as unknown as Record<string, unknown>)).toThrow(
      "set.patch.invalid",
    );
    expect(() => run.get("unknown-key")).toThrow("get.key.invalid");
    expect(() => run.add({ id: "expr:no-target" })).toThrow(
      "add.target.required",
    );

    run.add({
      id: "expr:dispatch-error",
      onError: "report",
      targets: [
        () => {
          throw new Error("boom");
        },
      ],
    });

    expect(() => run.impulse({ addFlags: ["dispatch"] })).not.toThrow();

    for (const code of seenCodes) {
      expect(code in DIAGNOSTIC_CODES).toBe(true);
    }
  });

  it("registry codes match <source>.<domain>.<event> schema", () => {
    for (const code of Object.keys(DIAGNOSTIC_CODES)) {
      expect((code.match(/\./g) ?? []).length).toBe(2);
      expect(code).toMatch(/^[a-z]+\.[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/);
    }
  });

  it("all DIAGNOSTIC_CODES use exactly 3 segments (2 dots)", () => {
    for (const code of Object.keys(DIAGNOSTIC_CODES)) {
      expect(code).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
      expect(code.split(".")).toHaveLength(3);
    }
  });

  it("uses only registered diagnostic codes in runtime sources", () => {
    const runtimeSourceRoot = resolve(process.cwd(), "src");

    const listRuntimeSourceFiles = (directory: string): string[] => {
      const entries = readdirSync(directory).sort((a, b) => a.localeCompare(b));
      const files: string[] = [];

      for (const entry of entries) {
        const absolutePath = resolve(directory, entry);
        const stats = statSync(absolutePath);

        if (stats.isDirectory()) {
          files.push(...listRuntimeSourceFiles(absolutePath));
          continue;
        }

        if (absolutePath.endsWith(".ts")) {
          files.push(absolutePath);
        }
      }

      return files;
    };

    const filesWithCodeFields = listRuntimeSourceFiles(runtimeSourceRoot)
      .map((absolutePath) => {
        const source = readFileSync(absolutePath, "utf8");
        return { absolutePath, source };
      })
      .filter(({ source }) => /code:\s*"([^"]+)"/g.test(source));

    const knownCodes = new Set(Object.keys(DIAGNOSTIC_CODES));

    for (const file of filesWithCodeFields) {
      const relativePath = file.absolutePath.replace(`${process.cwd()}/`, "");
      const matches = [...file.source.matchAll(/code:\s*"([^"]+)"/g)];
      for (const match of matches) {
        const code = match[1];
        if (code === undefined) {
          continue;
        }

        expect(knownCodes.has(code), `${relativePath} -> ${code}`).toBe(true);
      }
    }
  });
});
