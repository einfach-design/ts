/**
 * @file packages/runtime/tests/trace.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Deterministic trace recorder utilities for runtime conformance tests.
 */

import type { RuntimeDiagnostic } from "../src/diagnostics/index.js";

export type TargetTraceEvent = {
  type: "target";
  expressionId: string;
  signal?: string;
  occurrenceKind?: "registered" | "backfill";
};

export type DiagnosticTraceEvent = {
  type: "diagnostic";
  code: string;
  phase?: string;
};

export type ApiTraceEvent = {
  type: "api";
  event: "remove" | "tombstone";
  expressionId: string;
};

export type TraceEvent =
  | TargetTraceEvent
  | DiagnosticTraceEvent
  | ApiTraceEvent;

export function createTrace() {
  const events: TraceEvent[] = [];

  return {
    events,
    recordTarget(payload: {
      expressionId: string;
      signal?: string;
      occurrenceKind?: "registered" | "backfill";
    }) {
      events.push({ type: "target", ...payload });
    },
    recordDiagnostic(diagnostic: RuntimeDiagnostic) {
      const phase =
        diagnostic.data !== undefined &&
        typeof diagnostic.data.phase === "string"
          ? diagnostic.data.phase
          : undefined;
      events.push({
        type: "diagnostic",
        code: diagnostic.code,
        ...(phase !== undefined ? { phase } : {}),
      });
    },
    recordApiEvent(payload: {
      event: "remove" | "tombstone";
      expressionId: string;
    }) {
      events.push({ type: "api", ...payload });
    },
  };
}
