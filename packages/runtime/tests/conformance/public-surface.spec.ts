/**
 * @file packages/runtime/tests/conformance/public-surface.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Public API surface freeze checks.
 */

import { describe, expect, it } from "vitest";

describe("conformance/public-surface", () => {
  it("value entrypoint exports a stable surface", async () => {
    const mod = await import("../../src/index.js");
    expect(Object.keys(mod).sort()).toMatchInlineSnapshot(`
      [
        "createRuntime",
      ]
    `);
  });

  it("types entrypoint remains runtime-empty", async () => {
    const mod = await import("../../src/index.types.js");
    expect(Object.keys(mod).sort()).toMatchInlineSnapshot(`[]`);
  });
});
