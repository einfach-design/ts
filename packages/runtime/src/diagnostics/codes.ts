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
  "set.patch.invalid": {
    description: "set patch value must be an object.",
    severity: "error",
    shape: {
      valueType: "string",
    },
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
  "set.patch.flags.invalid": {
    description:
      "set patch flags value must be an object with list(array) and map(object).",
    severity: "error",
    shape: {
      valueType: "string",
      hasList: "boolean",
      hasMap: "boolean",
    },
  },
  "set.patch.signals.invalid": {
    description: "set patch signals value must be an array of strings.",
    severity: "error",
    shape: {},
  },
  "set.patch.impulseQ.invalid": {
    description: "set patch impulseQ value must be an object.",
    severity: "error",
    shape: {
      valueType: "string",
    },
  },
  "set.patch.impulseQ.q.forbidden": {
    description: "set patch must not include impulseQ.q.",
    severity: "error",
    shape: {
      field: "q",
    },
  },
  "add.target.required": {
    description: "add call requires at least one target or targets entry.",
    severity: "error",
    shape: {},
  },
  "add.objectTarget.missingEntrypoint": {
    description:
      "Object target must provide an `on` object entrypoint for dispatch.",
    severity: "error",
    shape: {
      signal: "string?",
    },
  },
  "add.objectTarget.missingHandler": {
    description:
      "Object target is missing a callable handler for one of the configured signals.",
    severity: "error",
    shape: {
      signal: "string",
    },
  },
  "add.objectTarget.nonCallableHandler": {
    description: "Object target signal handler exists but is not callable.",
    severity: "error",
    shape: {
      signal: "string",
    },
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
  "runtime.target.error": {
    description: "Target dispatch failed and was reported.",
    severity: "error",
    shape: {
      phase: "target/callback|target/object",
      targetKind: "callback|object",
      handler: "string?",
      signal: "string?",
      expressionId: "string?",
      occurrenceKind: "registered|backfill?",
    },
  },
  "runtime.onError.report": {
    description: "Runtime onError report mode captured an execution error.",
    severity: "error",
    shape: {
      phase: "string",
    },
  },
  "runs.max.exceeded": {
    description: "Expression reached configured runs.max and was ended.",
    severity: "warn",
    shape: {
      expressionId: "string",
      max: "number",
    },
  },
  "runtime.diagnostic.listenerError": {
    description: "Diagnostic listener threw while processing a diagnostic.",
    severity: "error",
    shape: {
      phase: "diagnostic/listener",
      listenerIndex: "number?",
      handlerName: "string?",
    },
  },
} as const satisfies Record<string, DiagnosticCodeSpec>;
