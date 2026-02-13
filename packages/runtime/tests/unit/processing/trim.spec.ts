import { describe, expect, it, vi } from "vitest";

import { trim } from "../../../src/processing/trim.js";

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
});
