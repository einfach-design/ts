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
import { readFileSync } from "node:fs";
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
        seenSignals: run.get("seenSignals") as Record<string, unknown>,
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

  it("emits set.patch.flags.conflict for conflicting flag patch forms", () => {
    const run = createRuntime();

    expect(() =>
      run.set({
        flags: { list: ["a"], map: { a: true } },
        addFlags: ["b"],
      }),
    ).toThrow("set.patch.flags.conflict");

    const diagnostics = run.get("diagnostics") as Array<{ code: string }>;
    expect(
      diagnostics.some((entry) => entry.code === "set.patch.flags.conflict"),
    ).toBe(true);
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
    const runtimeFiles = [
      "src/runtime/api/add.ts",
      "src/runtime/api/get.ts",
      "src/runtime/api/impulse.ts",
      "src/runtime/api/set.ts",
      "src/runtime/store.ts",
    ];

    const knownCodes = new Set(Object.keys(DIAGNOSTIC_CODES));

    for (const file of runtimeFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      const matches = [...source.matchAll(/code:\s*"([^"]+)"/g)];
      for (const match of matches) {
        const code = match[1];
        if (code === undefined) {
          continue;
        }
        expect(knownCodes.has(code)).toBe(true);
      }
    }
  });
});
