/**
 * @file packages/runtime/tests/conformance/public-surface.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Public API surface freeze checks.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("package.json dist export mapping is release-ready", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as {
      exports?: Record<string, Record<string, string>>;
      files?: string[];
      types?: string;
      main?: string;
    };

    expect(packageJson.files).toContain("dist");
    expect(packageJson.types).toBe("./dist/index.d.ts");
    expect(packageJson.main).toBe("./dist/index.js");

    expect(packageJson.exports?.["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    });

    expect(packageJson.exports?.["./types"]).toEqual({
      types: "./dist/index.types.d.ts",
    });
  });
});
