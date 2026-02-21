/**
 * @file packages/runtime/src/diagnostics/emit.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

import { DIAGNOSTIC_CODES } from "./codes.js";
import { hasOwn } from "../util/hasOwn.js";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

export interface RuntimeDiagnostic<TCode extends string = string> {
  readonly code: TCode;
  readonly message: string;
  readonly severity?: "info" | "warn" | "error";
  readonly data?: Record<string, unknown>;
}

export interface EmitDiagnosticOptions<
  TDiagnostic extends RuntimeDiagnostic = RuntimeDiagnostic,
> {
  readonly diagnostic: TDiagnostic;
  readonly listeners?: ReadonlySet<(diagnostic: TDiagnostic) => void>;
  readonly collector?: TDiagnostic[];
  readonly onListenerError?: (info: {
    error: unknown;
    listener: (diagnostic: TDiagnostic) => void;
    listenerIndex: number;
    handlerName?: string;
    diagnostic: TDiagnostic;
  }) => void;
  readonly __emittingListenerError?: boolean;
}

export interface DiagnosticCollector<
  TDiagnostic extends RuntimeDiagnostic = RuntimeDiagnostic,
> {
  emit: (diagnostic: TDiagnostic) => TDiagnostic;
  subscribe: (handler: (diagnostic: TDiagnostic) => void) => () => void;
  readonly list: () => readonly TDiagnostic[];
  clear: () => void;
}

/**
 * Diagnostic emission mechanics.
 */
export function emitDiagnostic<TDiagnostic extends RuntimeDiagnostic>(
  options: EmitDiagnosticOptions<TDiagnostic>,
): TDiagnostic {
  const { diagnostic, listeners, collector, onListenerError } = options;

  const isKnownCode = hasOwn(DIAGNOSTIC_CODES, diagnostic.code);
  const isTestMode =
    typeof process !== "undefined" &&
    (process.env.NODE_ENV === "test" || process.env.VITEST === "true");

  if (!isKnownCode && isTestMode) {
    throw new Error("diagnostics.code.unknown");
  }

  if (collector) {
    const snapshot: TDiagnostic = {
      ...diagnostic,
      ...(isPlainObject(diagnostic.data)
        ? { data: Object.freeze({ ...diagnostic.data }) }
        : {}),
    };
    collector.push(Object.freeze(snapshot));
  }

  if (listeners) {
    let listenerIndex = 0;
    for (const listener of listeners) {
      try {
        listener(diagnostic);
      } catch (error) {
        const handlerName = listener.name || undefined;

        onListenerError?.({
          error,
          listener,
          listenerIndex,
          ...(handlerName !== undefined ? { handlerName } : {}),
          diagnostic,
        });

        if (!options.__emittingListenerError) {
          const listenerErrorDiagnostic = {
            code: "runtime.diagnostic.listenerError",
            message:
              error instanceof Error
                ? error.message
                : "Diagnostic listener failed",
            severity: "error",
            data: {
              phase: "diagnostic/listener",
              listenerIndex,
              ...(handlerName !== undefined ? { handlerName } : {}),
            },
          } as unknown as TDiagnostic;

          emitDiagnostic({
            diagnostic: listenerErrorDiagnostic,
            listeners,
            ...(collector !== undefined ? { collector } : {}),
            ...(onListenerError !== undefined ? { onListenerError } : {}),
            __emittingListenerError: true,
          });
        }
      }

      listenerIndex += 1;
    }
  }

  return diagnostic;
}

export function createDiagnosticCollector<
  TDiagnostic extends RuntimeDiagnostic = RuntimeDiagnostic,
>(
  options?: Pick<EmitDiagnosticOptions<TDiagnostic>, "onListenerError">,
): DiagnosticCollector<TDiagnostic> {
  const diagnostics: TDiagnostic[] = [];
  const listeners = new Set<(diagnostic: TDiagnostic) => void>();

  return {
    emit(diagnostic) {
      return emitDiagnostic({
        diagnostic,
        listeners,
        collector: diagnostics,
        ...(options?.onListenerError !== undefined
          ? { onListenerError: options.onListenerError }
          : {}),
      });
    },
    subscribe(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    list() {
      return diagnostics.slice();
    },
    clear() {
      diagnostics.length = 0;
    },
  };
}
