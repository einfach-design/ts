import { describe, expect, it } from "vitest";

import { canonFlagSpecInput } from "../../../src/canon/flagSpecInput.js";

describe("canon/flagSpecInput", () => {
  it("canonicalizes a single flag token", () => {
    expect(canonFlagSpecInput("alpha")).toEqual([
      { flag: "alpha", value: true },
    ]);
  });

  it("collapses duplicates with last-one-wins in input order", () => {
    expect(canonFlagSpecInput(["a", "b", "a"])).toEqual([
      { flag: "b", value: true },
      { flag: "a", value: true },
    ]);
  });

  it("applies map defaults and supports remapped flags", () => {
    expect(
      canonFlagSpecInput({
        a: {},
        b: { flag: "a", value: false },
        c: "*",
      }),
    ).toEqual([
      { flag: "a", value: false },
      { flag: "c", value: "*" },
    ]);
  });

  it("throws add.flags.invalidToken for invalid flag tokens", () => {
    expect(() => canonFlagSpecInput(["ok", 123 as unknown as string])).toThrow(
      "add.flags.invalidToken",
    );
  });

  it("throws add.flags.invalidValue for invalid values", () => {
    expect(() =>
      canonFlagSpecInput({
        a: { value: "invalid" as "*" },
      }),
    ).toThrow("add.flags.invalidValue");
  });
});
