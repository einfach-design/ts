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
  it("throws for unknown diagnostic codes", () => {
    expect(() => {
      emitDiagnostic({
        diagnostic: {
          code: "unknown.code",
          message: "hello",
        },
      });
    }).toThrow("emit.code.unknown:unknown.code");
  });

  it("emits to listeners and collector", () => {
    const collector: Array<{ code: string; message: string }> = [];
    const listener = vi.fn();
    const listeners = new Set([listener]);

    const diagnostic = emitDiagnostic({
      diagnostic: { code: "dispatch.error", message: "hello" },
      collector,
      listeners,
    });

    expect(diagnostic).toEqual({ code: "dispatch.error", message: "hello" });
    expect(collector).toEqual([{ code: "dispatch.error", message: "hello" }]);
    expect(listener).toHaveBeenCalledWith({
      code: "dispatch.error",
      message: "hello",
    });
  });

  it("supports a reusable diagnostic collector with subscribe/remove", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const collector = createDiagnosticCollector();

    const removeA = collector.subscribe(handlerA);
    collector.subscribe(handlerB);

    collector.emit({ code: "dispatch.error", message: "A" });
    removeA();
    collector.emit({ code: "impulse.input.invalid", message: "B" });

    expect(collector.list()).toEqual([
      { code: "dispatch.error", message: "A" },
      { code: "impulse.input.invalid", message: "B" },
    ]);
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerA).toHaveBeenCalledWith({
      code: "dispatch.error",
      message: "A",
    });
    expect(handlerB).toHaveBeenCalledTimes(2);

    collector.clear();
    expect(collector.list()).toEqual([]);
  });
});
