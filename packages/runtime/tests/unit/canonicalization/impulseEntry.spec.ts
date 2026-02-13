import { describe, expect, it } from "vitest";

import { canonImpulseEntry } from "../../../src/canon/impulseEntry.js";

describe("canon/impulseEntry", () => {
  it("applies container defaults", () => {
    expect(canonImpulseEntry({})).toEqual({
      signals: [],
      addFlags: [],
      removeFlags: [],
      useFixedFlags: false,
    });
  });

  it("preserves sequence order and duplicates without netting", () => {
    expect(
      canonImpulseEntry({
        signals: ["s", "s"],
        addFlags: ["a", "a"],
        removeFlags: ["b", "b"],
      }),
    ).toEqual({
      signals: ["s", "s"],
      addFlags: ["a", "a"],
      removeFlags: ["b", "b"],
      useFixedFlags: false,
    });
  });

  it("keeps livePayload unchanged when provided as own property", () => {
    const payload = { nested: [1, 2, 3] };

    expect(canonImpulseEntry({ livePayload: payload })).toEqual({
      signals: [],
      addFlags: [],
      removeFlags: [],
      useFixedFlags: false,
      livePayload: payload,
    });
  });

  it("accepts valid useFixedFlags views", () => {
    expect(
      canonImpulseEntry({
        useFixedFlags: {
          list: ["x", "y"],
          map: { x: true, y: true },
        },
      }),
    ).toEqual({
      signals: [],
      addFlags: [],
      removeFlags: [],
      useFixedFlags: {
        list: ["x", "y"],
        map: { x: true, y: true },
      },
    });
  });

  it("returns undefined for invalid entry payloads", () => {
    expect(canonImpulseEntry({ signals: "bad" })).toBeUndefined();
    expect(
      canonImpulseEntry({
        useFixedFlags: { list: ["x", "x"], map: { x: true } },
      }),
    ).toBeUndefined();
  });
});
