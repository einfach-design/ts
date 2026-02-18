/**
 * @file packages/runtime/src/diagnostics/emit.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

import { DIAGNOSTIC_CODES } from "./codes.js";

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
  const { diagnostic, listeners, collector } = options;

  if (!(diagnostic.code in DIAGNOSTIC_CODES)) {
    throw new Error("diagnostics.code.unknown");
  }

  if (collector) {
    collector.push(diagnostic);
  }

  if (listeners) {
    for (const listener of listeners) {
      listener(diagnostic);
    }
  }

  return diagnostic;
}

export function createDiagnosticCollector<
  TDiagnostic extends RuntimeDiagnostic = RuntimeDiagnostic,
>(): DiagnosticCollector<TDiagnostic> {
  const diagnostics: TDiagnostic[] = [];
  const listeners = new Set<(diagnostic: TDiagnostic) => void>();

  return {
    emit(diagnostic) {
      return emitDiagnostic({ diagnostic, listeners, collector: diagnostics });
    },
    subscribe(handler) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
    list() {
      return diagnostics;
    },
    clear() {
      diagnostics.length = 0;
    },
  };
}
