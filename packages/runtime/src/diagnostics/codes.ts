/**
 * @file packages/runtime/src/diagnostics/codes.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Diagnostic code registry.
 */

/**
 * Diagnostic code registry.
 *
 * This is the single source of truth for:
 * - code -> { description, severity, shape }
 */
export type DiagnosticSeverity = "info" | "warn" | "error";

export interface DiagnosticCodeSpec {
  readonly description: string;
  readonly severity: DiagnosticSeverity;
  readonly shape: Record<string, unknown>;
}

export const DIAGNOSTIC_CODES = {
  "impulse.input.invalid": {
    description: "Invalid impulse payload was rejected.",
    severity: "error",
    shape: {},
  },
  "dispatch.error": {
    description: "Target dispatch failed and was reported.",
    severity: "error",
    shape: {
      phase: "target/callback|target/object",
      targetKind: "callback|object",
      handler: "string?",
    },
  },
  "runtime.onError.report": {
    description: "Runtime onError report mode captured an execution error.",
    severity: "error",
    shape: {
      phase: "string",
    },
  },
} as const satisfies Record<string, DiagnosticCodeSpec>;
