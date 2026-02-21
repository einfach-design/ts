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
  "set.hydration.flagsViewInvalid": {
    description:
      "Hydration flags/seenFlags/changedFlags must be a consistent FlagsView ({ list, map }).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.hydration.seenSignalsInvalid": {
    description:
      "Hydration seenSignals must be a consistent SeenSignals ({ list, map }).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.hydration.signalInvalid": {
    description: "Hydration signal must be a string when present.",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.hydration.backfillQInvalid": {
    description:
      "Hydration backfillQ must be a consistent id-view ({ list, map }).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.hydration.scopeProjectionBaselineInvalid": {
    description:
      "Hydration scopeProjectionBaseline must be a validated object with canonical scope projection fields.",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
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
  "set.flags.addRemoveConflict": {
    description:
      "set patch must not combine flags with addFlags/removeFlags in one call.",
    severity: "error",
    shape: {},
  },
  "set.flags.deltaInvalid": {
    description:
      "addFlags/removeFlags must be an array of strings or a FlagsView ({ list, map }).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.flags.invalid": {
    description:
      "set patch flags value must be an object with list(array) and map(object).",
    severity: "error",
    shape: {
      valueType: "string",
      hasList: "boolean",
      hasMap: "boolean",
    },
  },
  "set.defaults.invalid": {
    description: "defaults payload must follow SetDefaults/Defaults shape.",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.signals.invalid": {
    description: "set patch signals value must be an array of strings.",
    severity: "error",
    shape: {},
  },
  "set.impulseQ.invalid": {
    description: "set impulseQ value must be an object.",
    severity: "error",
    shape: {
      valueType: "string",
    },
  },
  "set.impulseQ.configInvalid": {
    description:
      "set impulseQ.config has invalid shape/type (must be an object).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.impulseQ.qForbidden": {
    description: "set patch must not include impulseQ.q.",
    severity: "error",
    shape: {
      field: "q",
    },
  },
  "set.impulseQ.retainInvalid": {
    description:
      "set patch impulseQ.config.retain has invalid type/value (not boolean/number or number is NaN).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.impulseQ.maxBytesInvalid": {
    description:
      "set patch impulseQ.config.maxBytes has invalid type/value (not number or number is NaN).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.impulseQ.qInvalid": {
    description:
      "set hydration impulseQ.q has invalid shape/value (entries not array or cursor out of integer range).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.impulseQ.entryInvalid": {
    description:
      "set hydration impulseQ.q.entries contains a non-canonicalizable entry.",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.impulseQ.onTrimInvalid": {
    description:
      "set impulseQ.config.onTrim has invalid type/value (must be undefined or function).",
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
    },
  },
  "set.impulseQ.onErrorInvalid": {
    description:
      'set impulseQ.config.onError has invalid type/value (must be undefined/function/"throw"|"report"|"swallow").',
    severity: "error",
    shape: {
      field: "string",
      valueType: "string",
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
