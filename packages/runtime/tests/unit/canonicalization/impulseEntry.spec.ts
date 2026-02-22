import { describe, expect, it } from "vitest";

import { canonImpulseEntry } from "../../../src/canon/impulseEntry.js";

describe("canon/impulseEntry", () => {
  it("applies container defaults", () => {
    expect(canonImpulseEntry({})).toEqual({
      onError: undefined,
      entry: {
        signals: [],
        addFlags: [],
        removeFlags: [],
        useFixedFlags: false,
      },
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
      onError: undefined,
      entry: {
        signals: ["s", "s"],
        addFlags: ["a", "a"],
        removeFlags: ["b", "b"],
        useFixedFlags: false,
      },
    });
  });

  it("keeps livePayload unchanged when provided as own property", () => {
    const payload = { nested: [1, 2, 3] };

    expect(canonImpulseEntry({ livePayload: payload })).toEqual({
      onError: undefined,
      entry: {
        signals: [],
        addFlags: [],
        removeFlags: [],
        useFixedFlags: false,
        livePayload: payload,
      },
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
      onError: undefined,
      entry: {
        signals: [],
        addFlags: [],
        removeFlags: [],
        useFixedFlags: {
          list: ["x", "y"],
          map: { x: true, y: true },
        },
      },
    });
  });

  it("keeps onError separate and returns undefined entry for invalid payloads", () => {
    expect(canonImpulseEntry({ signals: "bad", onError: "throw" })).toEqual({
      onError: "throw",
      entry: undefined,
    });
    expect(
      canonImpulseEntry({
        useFixedFlags: { list: ["x", "x"], map: { x: true } },
      }),
    ).toEqual({
      onError: undefined,
      entry: undefined,
    });
  });

  it("rejects non-string entries in string-list fields", () => {
    expect(
      canonImpulseEntry({ signals: ["ok", 1] as unknown as string[] }),
    ).toEqual({
      onError: undefined,
      entry: undefined,
    });

    expect(
      canonImpulseEntry({ addFlags: ["ok", null] as unknown as string[] }),
    ).toEqual({
      onError: undefined,
      entry: undefined,
    });

    expect(
      canonImpulseEntry({ removeFlags: ["ok", {}] as unknown as string[] }),
    ).toEqual({
      onError: undefined,
      entry: undefined,
    });
  });
  it("ignores unrelated throwing getters", () => {
    const input = {
      signals: [],
      addFlags: [],
      removeFlags: [],
      get boom() {
        throw new Error("boom");
      },
    };

    expect(() => canonImpulseEntry(input)).not.toThrow();
    const result = canonImpulseEntry(input);
    expect(result.entry).toBeDefined();
  });

  it("returns undefined entry + onError for invalid own onError", () => {
    expect(
      canonImpulseEntry({ onError: "nope" as never, signals: [] }),
    ).toEqual({
      entry: undefined,
      onError: undefined,
    });
  });
});
