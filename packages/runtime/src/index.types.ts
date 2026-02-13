/**
 * @file packages/runtime/src/index.types.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Public contract entrypoint for the runtime package.
 */

/**
 * Public type surface (contract boundary).
 *
 * Type-only module by convention:
 * - No runtime values.
 * - No imports from value/implementation modules (including `import type`), except the tightly scoped
 *   escape hatch defined by the Styleguide (which MUST NOT be used here).
 *
 * Add curated, intentional public type exports here (explicit exports only, no wildcards).
 *
 * Example (once leaf `*.types.ts` files exist):
 *   export type { RunTime, Scope } from './runtime.types';
 */
export {};
