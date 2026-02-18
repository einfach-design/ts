/**
 * @file packages/runtime/tests/conformance/types-entrypoint.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("conformance: public contract (types entrypoint)", () => {
  it("can be imported at runtime (resolver-compat shim)", async () => {
    // Note: This is intentionally a runtime import to validate the subpath export exists.
    // The module should remain effectively empty at runtime.
    const mod = await import("../../src/index.types.js");
    expect(mod).toBeDefined();
    expect(typeof mod).toBe("object");
  });

  it("keeps RegisteredExpression type as runs/coreRun SSoT in runtime/api", () => {
    const apiFiles = [
      "src/runtime/api/add.ts",
      "src/runtime/api/get.ts",
      "src/runtime/api/set.ts",
    ];

    for (const file of apiFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source.includes("type RegisteredExpression =")).toBe(false);
    }
  });
});
