/**
 * @file packages/runtime/tests/unit/dispatch.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Unit coverage for target dispatch.
 */

import { describe, expect, it, vi } from "vitest";

import { dispatch } from "../../src/targets/dispatch.js";

describe("targets/dispatch", () => {
  it("dispatches callable callback targets", () => {
    const callback = vi.fn();
    const result = dispatch({
      targetKind: "callback",
      target: callback,
      args: ["a", 1],
      onError: "throw",
    });

    expect(callback).toHaveBeenCalledWith("a", 1);
    expect(result.attempted).toBe(1);
  });

  it("reports non-callable callback targets via onError", () => {
    const onError = vi.fn();
    const result = dispatch({
      targetKind: "callback",
      target: 42,
      args: [],
      onError,
    });

    expect(result.attempted).toBe(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0].context.phase).toBe("target/callback");
  });

  it("dispatches object target handlers with silent non-callable semantics", () => {
    const everyRun = vi.fn();
    const signalHandler = vi.fn();
    const onError = vi.fn();
    const result = dispatch({
      targetKind: "object",
      target: {
        on: {
          everyRun,
          foo: signalHandler,
          bar: "not-callable",
        },
      },
      signal: "foo",
      args: [1, 2, 3],
      onError,
    });

    expect(everyRun).toHaveBeenCalledWith(1, 2, 3);
    expect(signalHandler).toHaveBeenCalledWith(1, 2, 3);
    expect(onError).not.toHaveBeenCalled();
    expect(result.attempted).toBe(2);

    const silent = dispatch({
      targetKind: "object",
      target: { on: { everyRun, bar: "not-callable" } },
      signal: "bar",
      args: [],
      onError,
    });

    expect(silent.attempted).toBe(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports invalid object target entrypoints", () => {
    const onError = vi.fn();
    const result = dispatch({
      targetKind: "object",
      target: { on: null },
      signal: "foo",
      args: [],
      onError,
    });

    expect(result.attempted).toBe(0);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0].context.phase).toBe("target/object");
  });

  it("swallow mode is silent and does not call reportError", () => {
    const reportError = vi.fn();
    const result = dispatch({
      targetKind: "callback",
      target: () => {
        throw new Error("boom");
      },
      args: [],
      onError: "swallow",
      reportError,
    });

    expect(result.attempted).toBe(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("report mode is silent for missing signal handler on object targets", () => {
    const reportError = vi.fn();
    const everyRun = vi.fn();
    const result = dispatch({
      targetKind: "object",
      target: { on: { everyRun } },
      signal: "foo",
      args: [],
      onError: "report",
      reportError,
    });

    expect(everyRun).toHaveBeenCalledWith();
    expect(result.attempted).toBe(1);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("throw mode is silent for missing signal handler on object targets", () => {
    expect(() =>
      dispatch({
        targetKind: "object",
        target: { on: { everyRun: vi.fn() } },
        signal: "foo",
        args: [],
        onError: "throw",
      }),
    ).not.toThrow();
  });
  it("includes context.signal for signal-specific object handler errors", () => {
    const onError = vi.fn();

    dispatch({
      targetKind: "object",
      target: {
        on: {
          foo: () => {
            throw new Error("boom");
          },
        },
      },
      signal: "foo",
      args: [],
      onError,
    });

    const issue = onError.mock.calls[0]?.[0];
    expect(issue.context.phase).toBe("target/object");
    expect(issue.context.handler).toBe("foo");
    expect(issue.context.signal).toBe("foo");
  });
});
