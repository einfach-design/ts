/**
 * @file packages/runtime/src/diagnostics/emit.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

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
  readonly onDiagnostic?: (diagnostic: TDiagnostic) => void;
  readonly collector?: TDiagnostic[];
}

export interface DiagnosticCollector<
  TDiagnostic extends RuntimeDiagnostic = RuntimeDiagnostic,
> {
  emit: (diagnostic: TDiagnostic) => TDiagnostic;
  readonly list: () => readonly TDiagnostic[];
  clear: () => void;
}

/**
 * Diagnostic emission mechanics.
 */
export function emitDiagnostic<TDiagnostic extends RuntimeDiagnostic>(
  options: EmitDiagnosticOptions<TDiagnostic>,
): TDiagnostic {
  const { diagnostic, onDiagnostic, collector } = options;

  if (collector) {
    collector.push(diagnostic);
  }

  onDiagnostic?.(diagnostic);

  return diagnostic;
}

export function createDiagnosticCollector<
  TDiagnostic extends RuntimeDiagnostic = RuntimeDiagnostic,
>(
  onDiagnostic?: (diagnostic: TDiagnostic) => void,
): DiagnosticCollector<TDiagnostic> {
  const diagnostics: TDiagnostic[] = [];

  return {
    emit(diagnostic) {
      return onDiagnostic
        ? emitDiagnostic({ diagnostic, onDiagnostic, collector: diagnostics })
        : emitDiagnostic({ diagnostic, collector: diagnostics });
    },
    list() {
      return diagnostics;
    },
    clear() {
      diagnostics.length = 0;
    },
  };
}
