/**
 * @file packages/runtime/tsup.config.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package documentation and configuration.
 * @description tsup build configuration for the runtime package.
 */

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/index.types.ts"],
  format: ["esm"],
  platform: "node",
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
