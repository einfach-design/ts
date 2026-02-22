import { describe, expect, it, vi } from "vitest";

import { trim } from "../../../src/processing/trim.js";
import { createRuntime } from "../../../src/index.js";

describe("processing/trim", () => {
  it("runs retain-trim first and then maxBytes-trim", () => {
    const onTrim = vi.fn();

    const result = trim({
      entries: [
        { id: "a", bytes: 4 },
        { id: "b", bytes: 4 },
        { id: "c", bytes: 4 },
      ],
      cursor: 3,
      retain: 2,
      maxBytes: 4,
      runtimeStackActive: false,
      trimPendingMaxBytes: false,
      measureBytes: (entry) => entry.bytes,
      onTrim,
    });

    expect(result.entries).toEqual([{ id: "c", bytes: 4 }]);
    expect(result.cursor).toBe(1);
    expect(result.events.map((event) => event.reason)).toEqual([
      "retain",
      "maxBytes",
    ]);
    expect(onTrim).toHaveBeenCalledTimes(2);
    expect(onTrim.mock.calls[0]?.[0]).toMatchObject({
      entries: [{ id: "a", bytes: 4 }],
      stats: { reason: "retain", bytesFreed: 4 },
    });
    expect(onTrim.mock.calls[1]?.[0]).toMatchObject({
      entries: [{ id: "b", bytes: 4 }],
      stats: { reason: "maxBytes", bytesFreed: 4 },
    });
  });

  it("defers maxBytes trimming while runtime stack is active", () => {
    const onTrim = vi.fn();

    const result = trim({
      entries: [
        { id: "a", bytes: 4 },
        { id: "b", bytes: 4 },
      ],
      cursor: 2,
      retain: true,
      maxBytes: 3,
      runtimeStackActive: true,
      trimPendingMaxBytes: false,
      measureBytes: (entry) => entry.bytes,
      onTrim,
    });

    expect(result.entries).toEqual([
      { id: "a", bytes: 4 },
      { id: "b", bytes: 4 },
    ]);
    expect(result.cursor).toBe(2);
    expect(result.trimPendingMaxBytes).toBe(true);
    expect(result.events).toEqual([]);
    expect(onTrim).not.toHaveBeenCalled();
  });

  it("trims only applied entries and keeps pending segment untouched", () => {
    const result = trim({
      entries: [
        { id: "a", bytes: 1 },
        { id: "b", bytes: 1 },
        { id: "pending", bytes: 100 },
      ],
      cursor: 2,
      retain: 1,
      maxBytes: Number.POSITIVE_INFINITY,
      runtimeStackActive: false,
      trimPendingMaxBytes: false,
      measureBytes: (entry) => entry.bytes,
    });

    expect(result.entries).toEqual([
      { id: "b", bytes: 1 },
      { id: "pending", bytes: 100 },
    ]);
    expect(result.cursor).toBe(1);
    expect(result.events).toEqual([
      { reason: "retain", removedCount: 1, cursorDelta: 1 },
    ]);
  });

  it("keeps all applied entries when retain is positive infinity", () => {
    const onTrim = vi.fn();

    const result = trim({
      entries: [
        { id: "a", bytes: 4 },
        { id: "b", bytes: 4 },
      ],
      cursor: 2,
      retain: Number.POSITIVE_INFINITY,
      maxBytes: Number.POSITIVE_INFINITY,
      runtimeStackActive: false,
      trimPendingMaxBytes: false,
      measureBytes: (entry) => entry.bytes,
      onTrim,
    });

    expect(result.entries).toEqual([
      { id: "a", bytes: 4 },
      { id: "b", bytes: 4 },
    ]);
    expect(result.cursor).toBe(2);
    expect(result.events).toEqual([]);
    expect(onTrim).not.toHaveBeenCalled();
  });

  it("does not measure bytes when maxBytes is Infinity and retain trim does not run", () => {
    const measureBytes = vi.fn((entry: { bytes: number }) => entry.bytes);

    trim({
      entries: [{ id: "a", bytes: 4 }],
      cursor: 1,
      retain: true,
      maxBytes: Number.POSITIVE_INFINITY,
      runtimeStackActive: false,
      trimPendingMaxBytes: true,
      measureBytes,
    });

    expect(measureBytes).toHaveBeenCalledTimes(0);
  });

  it("clears pending maxBytes when runtime stack is inactive", () => {
    const entries = [
      { id: "a", bytes: 4 },
      { id: "b", bytes: 4 },
    ];

    const deferred = trim({
      entries,
      cursor: 2,
      retain: true,
      maxBytes: 3,
      runtimeStackActive: true,
      trimPendingMaxBytes: false,
      measureBytes: (entry) => entry.bytes,
    });

    expect(deferred.trimPendingMaxBytes).toBe(true);

    const flushed = trim({
      entries,
      cursor: 2,
      retain: true,
      maxBytes: 3,
      runtimeStackActive: false,
      trimPendingMaxBytes: deferred.trimPendingMaxBytes,
      measureBytes: (entry) => entry.bytes,
    });

    expect(flushed.trimPendingMaxBytes).toBe(false);
    expect(flushed.entries).toEqual([]);
    expect(flushed.cursor).toBe(0);
    expect(flushed.events).toEqual([
      { reason: "maxBytes", removedCount: 2, cursorDelta: 2 },
    ]);
  });

  it("keeps pendingOnly projection isolated from baseline after trim", () => {
    const run = createRuntime();

    run.impulse({ signals: ["applied"], addFlags: ["a"] });

    const hydration = run.get("*", { as: "snapshot" }) as {
      impulseQ: {
        q: { entries: Array<Record<string, unknown>>; cursor: number };
      };
    } & Record<string, unknown>;

    hydration.impulseQ.q.entries = [
      { signals: ["applied"], addFlags: ["a"], removeFlags: [] },
      { signals: ["pending"], addFlags: ["b"], removeFlags: [] },
    ];
    hydration.impulseQ.q.cursor = 1;
    run.set(hydration);

    run.set({ impulseQ: { config: { retain: 0 } } });

    expect(run.get("flags", { scope: "applied", as: "snapshot" })).toEqual({
      list: ["a"],
      map: { a: true },
    });
    expect(run.get("flags", { scope: "pending", as: "snapshot" })).toEqual({
      list: ["a", "b"],
      map: { a: true, b: true },
    });
    expect(run.get("flags", { scope: "pendingOnly", as: "snapshot" })).toEqual({
      list: ["b"],
      map: { b: true },
    });
  });
});
