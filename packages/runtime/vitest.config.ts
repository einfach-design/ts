/**
 * @file packages/runtime/vitest.config.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package documentation and configuration.
 * @description Vitest configuration for the runtime package.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    exclude: ["dist/**", "docs/**"],
  },
});
