/**
 * @file packages/runtime/tests/unit/emit.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Unit coverage for diagnostics emission.
 */

import { describe, expect, it, vi } from "vitest";

import {
  createDiagnosticCollector,
  emitDiagnostic,
} from "../../src/diagnostics/emit.js";

describe("diagnostics/emit", () => {
  it("emits to onDiagnostic and collector", () => {
    const collector: Array<{ code: string; message: string }> = [];
    const onDiagnostic = vi.fn();

    const diagnostic = emitDiagnostic({
      diagnostic: { code: "x", message: "hello" },
      collector,
      onDiagnostic,
    });

    expect(diagnostic).toEqual({ code: "x", message: "hello" });
    expect(collector).toEqual([{ code: "x", message: "hello" }]);
    expect(onDiagnostic).toHaveBeenCalledWith({ code: "x", message: "hello" });
  });

  it("supports a reusable diagnostic collector", () => {
    const onDiagnostic = vi.fn();
    const collector = createDiagnosticCollector(onDiagnostic);

    collector.emit({ code: "a", message: "A" });
    collector.emit({ code: "b", message: "B" });

    expect(collector.list()).toEqual([
      { code: "a", message: "A" },
      { code: "b", message: "B" },
    ]);
    expect(onDiagnostic).toHaveBeenCalledTimes(2);

    collector.clear();
    expect(collector.list()).toEqual([]);
  });
});
