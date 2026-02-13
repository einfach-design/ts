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
}

export interface DispatchError {
  readonly error: Error;
  readonly context: DispatchContext;
}

export interface DispatchInput {
  readonly targetKind: DispatchTargetKind;
  readonly target: unknown;
  readonly signal?: string;
  readonly args: readonly unknown[];
  readonly onError?: (issue: DispatchError) => void;
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

function reportDispatchError(
  onError: DispatchInput["onError"],
  context: DispatchContext,
  fallbackMessage: string,
): void {
  if (!onError) {
    return;
  }

  onError({
    error: new Error(fallbackMessage),
    context,
  });
}

function callHandler(
  candidate: unknown,
  args: readonly unknown[],
  onError: DispatchInput["onError"],
  context: DispatchContext,
): number {
  if (!isCallable(candidate)) {
    return 0;
  }

  try {
    candidate(...args);
    return 1;
  } catch (error) {
    if (onError) {
      onError({
        error: asError(error, `Dispatch failed in ${context.phase}`),
        context,
      });
    }

    return 0;
  }
}

/**
 * Target dispatch (callback/object) + silent semantics.
 */
export function dispatch(input: DispatchInput): DispatchResult {
  const { targetKind, target, signal, args, onError } = input;

  if (targetKind === "callback") {
    if (!isCallable(target)) {
      reportDispatchError(
        onError,
        { phase: "target/callback", targetKind },
        "Callback target must be callable.",
      );
      return { attempted: 0 };
    }

    return {
      attempted: callHandler(target, args, onError, {
        phase: "target/callback",
        targetKind,
      }),
    };
  }

  if (!isObjectNonNull(target) || !isObjectNonNull(target.on)) {
    reportDispatchError(
      onError,
      { phase: "target/object", targetKind },
      "Object target must expose an object `on` entrypoint.",
    );
    return { attempted: 0 };
  }

  let attempted = 0;
  attempted += callHandler(target.on[EVERY_RUN_HANDLER], args, onError, {
    phase: "target/object",
    targetKind,
    handler: EVERY_RUN_HANDLER,
  });

  if (
    signal &&
    signal !== EVERY_RUN_HANDLER &&
    Object.prototype.hasOwnProperty.call(target.on, signal)
  ) {
    attempted += callHandler(target.on[signal], args, onError, {
      phase: "target/object",
      targetKind,
      handler: signal,
    });
  }

  return { attempted };
}
