/**
 * @file packages/runtime/tests/conformance/diagnostic-codes.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance smoke tests for stable diagnostic codes.
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

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

  it("emits diagnostics.listener.error when a diagnostic listener throws", () => {
    const run = createRuntime();
    const seen: string[] = [];

    run.onDiagnostic((diagnostic) => {
      seen.push(diagnostic.code);
    });

    run.onDiagnostic(() => {
      throw new Error("listener boom");
    });

    expect(() => run.get("unknown-key")).toThrow("get.key.invalid");

    expect(seen).toContain("diagnostics.listener.error");
  });
});
