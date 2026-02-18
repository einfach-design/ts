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
  "add.objectTarget.missingEntrypoint": {
    description: "Object target must expose an object on-entrypoint.",
    severity: "error",
    shape: {},
  },
  "add.objectTarget.missingHandler": {
    description: "Object target entrypoint is missing a required handler.",
    severity: "error",
    shape: {
      signal: "string",
    },
  },
  "add.objectTarget.nonCallableHandler": {
    description: "Object target handler must be callable.",
    severity: "error",
    shape: {
      signal: "string",
    },
  },
  "add.target.required": {
    description: "add requires at least one target.",
    severity: "error",
    shape: {},
  },
  "impulse.input.invalid": {
    description: "Invalid impulse payload was rejected.",
    severity: "error",
    shape: {},
  },
  "get.key.invalid": {
    description: "Requested runtime getter key is invalid.",
    severity: "error",
    shape: {
      key: "string?",
    },
  },
  "runs.max.exceeded": {
    description: "Expression run budget was exhausted.",
    severity: "warn",
    shape: {
      expressionId: "string?",
      gate: "signal|flags|runtime",
    },
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
  "set.hydration.incomplete": {
    description: "Hydration patch is missing required keys.",
    severity: "error",
    shape: {
      key: "string?",
    },
  },
  "set.patch.flags.conflict": {
    description:
      "Patch cannot provide both addFlags and removeFlags without canonical form.",
    severity: "error",
    shape: {},
  },
  "set.patch.flags.invalid": {
    description: "Patch contains invalid flag tokens.",
    severity: "error",
    shape: {},
  },
  "set.patch.forbidden": {
    description: "Patch contains forbidden keys for the current operation.",
    severity: "error",
    shape: {
      key: "string?",
    },
  },
  "set.patch.impulseQ.invalid": {
    description: "Patch contains an invalid impulseQ payload.",
    severity: "error",
    shape: {},
  },
  "set.patch.impulseQ.q.forbidden": {
    description: "Patch cannot write impulseQ queue internals directly.",
    severity: "error",
    shape: {},
  },
  "set.patch.invalid": {
    description: "run.set requires a non-null object patch.",
    severity: "error",
    shape: {},
  },
  "trim.maxBytes.exceeded": {
    description: "maxBytes trim could not satisfy the configured budget fully.",
    severity: "warn",
    shape: {
      maxBytes: "number",
    },
  },
  "trim.retain.exceeded": {
    description: "retain trim removed applied queue entries.",
    severity: "info",
    shape: {
      retain: "number",
      removedCount: "number",
    },
  },
  "runtime.onError.report": {
    description: "Runtime onError report mode captured an execution error.",
    severity: "error",
    shape: {
      phase: "string",
    },
  },
  "listener.callback.invalid": {
    description: "Listener callback must be callable.",
    severity: "error",
    shape: {},
  },
  "emit.code.unknown": {
    description:
      "Emission was blocked because the diagnostic code is unregistered.",
    severity: "error",
    shape: {
      code: "string",
    },
  },
} as const satisfies Record<string, DiagnosticCodeSpec>;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CODES;
