/**
 * @file packages/runtime/scripts/build.mjs
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package documentation and configuration.
 * @description Local build helper script for the runtime package.
 */

// Optional build wrapper. Kept minimal intentionally.
// Usage: node scripts/build.mjs
import { execSync } from 'node:child_process';

execSync('pnpm build', { stdio: 'inherit' });
