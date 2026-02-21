import { describe, expect, it, vi } from "vitest";

import { drain } from "../../../src/processing/drain.js";

describe("processing/drain", () => {
  it("processes pending entries in FIFO order and advances cursor", () => {
    const processed: number[] = [];

    const result = drain({
      entries: [1, 2, 3],
      cursor: 1,
      draining: false,
      process: (entry) => {
        processed.push(entry);
      },
    });

    expect(processed).toEqual([2, 3]);
    expect(result).toEqual({ cursor: 3, draining: false, aborted: false });
  });

  it("does not start nested drain when already draining", () => {
    const process = vi.fn();

    const result = drain({
      entries: [1, 2],
      cursor: 0,
      draining: true,
      process,
    });

    expect(process).not.toHaveBeenCalled();
    expect(result).toEqual({ cursor: 0, draining: true, aborted: false });
  });

  it("aborts drain on throw and advances cursor past failing entry", () => {
    const onAbort = vi.fn();

    const result = drain({
      entries: [1, 2, 3],
      cursor: 0,
      draining: false,
      process: (entry) => {
        if (entry === 2) {
          throw new Error("boom");
        }
      },
      onAbort,
    });

    expect(onAbort).toHaveBeenCalledOnce();
    expect(onAbort.mock.calls[0]?.[0]).toMatchObject({
      atCursor: 1,
      phase: "process",
    });
    expect(result).toEqual({ cursor: 2, draining: false, aborted: true });
  });
});
