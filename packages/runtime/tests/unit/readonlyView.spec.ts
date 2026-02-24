import { describe, it, expect } from "vitest";
import { readonlyView } from "../../src/runtime/util.js";

describe("unit/readonlyView", () => {
  it("Map/Set: mutators throw and unknown function props do not expose target-bound methods", () => {
    const m = readonlyView(new Map([["a", { x: 1 }]]));
    const s = readonlyView(new Set(["a"]));

    // explicit mutators
    expect(() => (m as Map<string, unknown>).set("b", 1)).toThrow("readonly");
    expect(() => (s as Set<string>).add("b")).toThrow("readonly");

    // unknown function access should throw when called (no bind(target) escape hatch)
    const toString = (m as unknown as Record<string, unknown>).toString as (
      this: unknown,
    ) => string;
    expect(() => toString.call(m)).toThrow("readonly");
  });
});
