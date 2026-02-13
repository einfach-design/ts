/**
 * @file packages/runtime/tests/conformance/public-contract.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 */

import { describe, expect, it } from "vitest";

describe("conformance: public contract (values)", () => {
  it("exports createRuntime from the public entry", async () => {
    const mod = await import("../../src/index.js");
    expect(typeof mod.createRuntime).toBe("function");
  });

  it('createRuntime() throws a clear "not implemented" error (starter-pack stub)', async () => {
    const { createRuntime } = await import("../../src/index.js");
    expect(() => createRuntime()).toThrowError(/not implemented/i);
  });
});
