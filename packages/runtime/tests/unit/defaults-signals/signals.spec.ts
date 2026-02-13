import { describe, expect, it } from "vitest";

import {
  extendSeenSignals,
  projectSignal,
  signals,
} from "../../../src/state/signals.js";

describe("signals", () => {
  it("projects scalar signal from list", () => {
    expect(projectSignal(undefined)).toBeUndefined();
    expect(projectSignal([])).toBeUndefined();
    expect(projectSignal(["a", "b"])).toBe("b");
  });

  it("extends seenSignals monotonically", () => {
    const seen = extendSeenSignals(
      {
        list: ["a"],
        map: { a: true },
      },
      ["a", "b", "b", "c"],
    );

    expect(seen.list).toEqual(["a", "b", "c"]);
    expect(seen.map).toEqual({ a: true, b: true, c: true });
  });

  it("updates scalar signal + seenSignals when signals is an own property", () => {
    const result = signals({
      previousSignal: "a",
      previousSeenSignals: {
        list: ["a"],
        map: { a: true },
      },
      signals: ["x", "y"],
    });

    expect(result.signal).toBe("y");
    expect(result.seenSignals.list).toEqual(["a", "x", "y"]);
  });

  it("respects explicit seenSignals own property", () => {
    const result = signals({
      previousSeenSignals: {
        list: ["a"],
        map: { a: true },
      },
      signals: ["b"],
      seenSignals: {
        list: ["z"],
        map: { z: true },
      },
    });

    expect(result.signal).toBe("b");
    expect(result.seenSignals).toEqual({
      list: ["z"],
      map: { z: true },
    });
  });
});
