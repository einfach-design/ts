/**
 * @file packages/runtime/src/targets/dispatch.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

const EVERY_RUN_HANDLER = "everyRun";

export type DispatchTargetKind = "callback" | "object";
export type DispatchPhase = "target/callback" | "target/object";

export interface DispatchContext {
  readonly phase: DispatchPhase;
  readonly targetKind: DispatchTargetKind;
  readonly handler?: string;
  readonly signal?: string;
  readonly expressionId?: string;
  readonly occurrenceKind?: "registered" | "backfill";
}

export interface DispatchError {
  readonly error: Error;
  readonly context: DispatchContext;
}

export type DispatchOnErrorMode =
  | "throw"
  | "report"
  | "swallow"
  | ((issue: DispatchError) => void);

export interface DispatchInput {
  readonly targetKind: DispatchTargetKind;
  readonly target: unknown;
  readonly signal?: string;
  readonly args: readonly unknown[];
  readonly onError: DispatchOnErrorMode;
  readonly reportError?: (issue: DispatchError) => void;
  readonly context?: Pick<DispatchContext, "expressionId" | "occurrenceKind">;
}

export interface DispatchResult {
  readonly attempted: number;
}

function isObjectNonNull(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCallable(
  value: unknown,
): value is (...args: readonly unknown[]) => unknown {
  return typeof value === "function";
}

function asError(value: unknown, fallbackMessage: string): Error {
  return value instanceof Error ? value : new Error(fallbackMessage);
}

function emitDispatchError(
  onError: DispatchInput["onError"],
  reportError: DispatchInput["reportError"],
  issue: DispatchError,
): never | void {
  if (typeof onError === "function") {
    onError(issue);
    return;
  }

  if (onError === "swallow") {
    return;
  }

  if (onError === "report") {
    if (reportError !== undefined) {
      reportError(issue);
      return;
    }

    return;
  }

  if (onError === "throw") {
    throw issue.error;
  }

  if (reportError !== undefined) {
    reportError(issue);
    return;
  }

  throw issue.error;
}

function reportDispatchError(
  onError: DispatchInput["onError"],
  reportError: DispatchInput["reportError"],
  context: DispatchContext,
  fallbackMessage: string,
): void {
  emitDispatchError(onError, reportError, {
    error: new Error(fallbackMessage),
    context,
  });
}

function callHandler(
  candidate: unknown,
  args: readonly unknown[],
  onError: DispatchInput["onError"],
  reportError: DispatchInput["reportError"],
  context: DispatchContext,
): number {
  if (!isCallable(candidate)) {
    return 0;
  }

  try {
    candidate(...args);
    return 1;
  } catch (error) {
    emitDispatchError(onError, reportError, {
      error: asError(error, `Dispatch failed in ${context.phase}`),
      context,
    });

    return 0;
  }
}

/**
 * Target dispatch (callback/object) + silent semantics.
 */
export function dispatch(input: DispatchInput): DispatchResult {
  const { targetKind, target, signal, args, onError, reportError, context } =
    input;

  if (targetKind === "callback") {
    if (!isCallable(target)) {
      reportDispatchError(
        onError,
        reportError,
        {
          phase: "target/callback",
          targetKind,
          ...(signal !== undefined ? { signal } : {}),
          ...(context ?? {}),
        },
        "Callback target must be callable.",
      );
      return { attempted: 0 };
    }

    return {
      attempted: callHandler(target, args, onError, reportError, {
        phase: "target/callback",
        targetKind,
        ...(signal !== undefined ? { signal } : {}),
        ...(context ?? {}),
      }),
    };
  }

  if (!isObjectNonNull(target) || !isObjectNonNull(target.on)) {
    reportDispatchError(
      onError,
      reportError,
      {
        phase: "target/object",
        targetKind,
        ...(signal !== undefined ? { signal } : {}),
        ...(context ?? {}),
      },
      "Object target must expose an object `on` entrypoint.",
    );
    return { attempted: 0 };
  }

  let attempted = 0;
  if (hasOwn(target.on, EVERY_RUN_HANDLER)) {
    attempted += callHandler(
      target.on[EVERY_RUN_HANDLER],
      args,
      onError,
      reportError,
      {
        phase: "target/object",
        targetKind,
        handler: EVERY_RUN_HANDLER,
        ...(signal !== undefined ? { signal } : {}),
        ...(context ?? {}),
      },
    );
  }

  if (
    signal !== undefined &&
    signal !== EVERY_RUN_HANDLER &&
    hasOwn(target.on, signal)
  ) {
    attempted += callHandler(target.on[signal], args, onError, reportError, {
      phase: "target/object",
      targetKind,
      handler: signal,
      ...(context ?? {}),
    });
  }

  return { attempted };
}
import { hasOwn } from "../util/hasOwn.js";
