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
  "set.hydration.incomplete": {
    description: "Hydration patch is missing one or more required keys.",
    severity: "error",
    shape: {},
  },
  "set.patch.forbidden": {
    description: "set patch contains forbidden keys for partial updates.",
    severity: "error",
    shape: {},
  },
  "set.patch.flags.conflict": {
    description:
      "set patch must not combine flags with addFlags/removeFlags in one call.",
    severity: "error",
    shape: {},
  },
  "add.target.required": {
    description: "add call requires at least one target or targets entry.",
    severity: "error",
    shape: {},
  },
  "get.key.invalid": {
    description: "get was called with an unknown key.",
    severity: "error",
    shape: {
      key: "string",
    },
  },
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
  "diagnostics.listener.error": {
    description: "Diagnostic listener threw while processing a diagnostic.",
    severity: "error",
    shape: {
      phase: "diagnostic/listener",
      listenerIndex: "number?",
      handlerName: "string?",
    },
  },
} as const satisfies Record<string, DiagnosticCodeSpec>;
