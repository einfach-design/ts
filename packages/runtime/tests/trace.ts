/**
 * @file packages/runtime/tests/trace.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Conformance and test utilities for the runtime package.
 */

// Trace helpers for conformance tests.
// TODO: implement trace recorder per impl plan.
export type TraceEvent = { type: string; payload?: unknown };

export function createTrace() {
  const events: TraceEvent[] = [];
  return {
    events,
    push: (e: TraceEvent) => events.push(e),
  };
}
