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
  it("emits to listeners and collector", () => {
    const collector: Array<{ code: string; message: string }> = [];
    const listener = vi.fn();
    const listeners = new Set([listener]);

    const diagnostic = emitDiagnostic({
      diagnostic: { code: "impulse.input.invalid", message: "hello" },
      collector,
      listeners,
    });

    expect(diagnostic).toEqual({
      code: "impulse.input.invalid",
      message: "hello",
    });
    expect(collector).toEqual([
      { code: "impulse.input.invalid", message: "hello" },
    ]);
    expect(listener).toHaveBeenCalledWith({
      code: "impulse.input.invalid",
      message: "hello",
    });
  });

  it("throws for unknown diagnostic codes", () => {
    expect(() =>
      emitDiagnostic({
        diagnostic: { code: "unknown.code.value", message: "x" },
      }),
    ).toThrow("diagnostics.code.unknown");
  });

  it("supports a reusable diagnostic collector with subscribe/remove", () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const collector = createDiagnosticCollector();

    const removeA = collector.subscribe(handlerA);
    collector.subscribe(handlerB);

    collector.emit({ code: "runtime.target.error", message: "A" });
    removeA();
    collector.emit({ code: "runtime.onError.report", message: "B" });

    expect(collector.list()).toEqual([
      { code: "runtime.target.error", message: "A" },
      { code: "runtime.onError.report", message: "B" },
    ]);
    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerA).toHaveBeenCalledWith({
      code: "runtime.target.error",
      message: "A",
    });
    expect(handlerB).toHaveBeenCalledTimes(2);

    collector.clear();
    expect(collector.list()).toEqual([]);
  });

  it("passes one frozen diagnostic snapshot instance to all listeners", () => {
    const listenerB = vi.fn();
    const listenerA = vi.fn(
      (diagnostic: { message: string; data?: { value?: number } }) => {
        expect(() => {
          (diagnostic as { message: string }).message = "mutated";
        }).toThrow();
        expect(() => {
          if (diagnostic.data !== undefined) {
            diagnostic.data.value = 2;
          }
        }).toThrow();
      },
    );

    const listeners = new Set([listenerA, listenerB]);
    emitDiagnostic({
      diagnostic: {
        code: "runtime.target.error",
        message: "original",
        data: { value: 1 },
      },
      listeners,
    });

    const firstArgA = listenerA.mock.calls[0]?.[0];
    const firstArgB = listenerB.mock.calls[0]?.[0];
    expect(firstArgA).toBe(firstArgB);
    expect(firstArgB).toMatchObject({
      message: "original",
      data: { value: 1 },
    });
    expect(Object.isFrozen(firstArgB)).toBe(true);
    expect(Object.isFrozen(firstArgB?.data)).toBe(true);
  });

  it("prevents recursive listenerError emission loops", () => {
    const collector = createDiagnosticCollector();
    const seen: string[] = [];

    collector.subscribe((diagnostic) => {
      seen.push(diagnostic.code);
      throw new Error("listener boom");
    });

    expect(() =>
      collector.emit({ code: "impulse.input.invalid", message: "hello" }),
    ).not.toThrow();

    expect(
      seen.filter((code) => code === "runtime.diagnostic.listenerError"),
    ).toHaveLength(1);
  });
});
