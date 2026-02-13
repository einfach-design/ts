import { describe, expect, it } from "vitest";

import { computeChangedFlags } from "../../../src/state/changedFlags.js";
import { createFlagsView } from "../../../src/state/flagsView.js";

describe("createFlagsView", () => {
  it("creates stable-unique list with first occurrence wins", () => {
    const view = createFlagsView(["a", "b", "a", "c", "b"]);

    expect(view.list).toEqual(["a", "b", "c"]);
    expect(Object.keys(view.map)).toEqual(["a", "b", "c"]);
    expect(view.map.a).toBe(true);
    expect(view.map.b).toBe(true);
    expect(view.map.c).toBe(true);
  });
});

describe("computeChangedFlags", () => {
  it("uses symmetric-diff membership and remove-then-add ordering", () => {
    const prev = createFlagsView(["a", "b", "c"]);
    const next = createFlagsView(["b", "d"]);

    const changed = computeChangedFlags(
      prev,
      next,
      ["c", "a"],
      ["d", "a", "e"],
    );

    expect(changed.list).toEqual(["c", "a", "d"]);
    expect(Object.keys(changed.map)).toEqual(["c", "a", "d"]);
  });

  it("ignores ineffective removes and conflicted adds", () => {
    const prev = createFlagsView(["x"]);
    const next = createFlagsView(["x", "y"]);

    const changed = computeChangedFlags(
      prev,
      next,
      ["ghost", "y"],
      ["y", "ghost", "y"],
    );

    expect(changed.list).toEqual(["y"]);
    expect(changed.map.y).toBe(true);
    expect(changed.map.ghost).toBeUndefined();
  });

  it("returns empty when membership has no changes", () => {
    const prev = createFlagsView(["a", "b"]);
    const next = createFlagsView(["a", "b"]);

    const changed = computeChangedFlags(prev, next, ["a"], ["a"]);

    expect(changed.list).toEqual([]);
    expect(changed.map).toEqual({});
  });
});
