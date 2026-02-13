/**
 * @file packages/runtime/src/index.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Public contract entrypoint for the runtime package.
 */

/**
 * Public value surface (contract boundary).
 *
 * This module MUST remain curated and stable over time.
 * - Export only intentional public runtime APIs.
 * - Do not expose internal module paths (no deep exports).
 *
 * Implementation details live in their own modules.
 */
export { createRuntime } from './runtime';
