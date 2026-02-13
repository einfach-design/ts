/**
 * @file packages/runtime/src/diagnostics/codes.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

/**
 * Diagnostic code registry.
 *
 * This is the single source of truth for:
 * - code -> { description, severity, shape }
 *
 * NOTE:
 * - Keep this registry stable and curated.
 * - Do not encode policy here; policy belongs to the runtime semantics.
 */
export type DiagnosticSeverity = 'info' | 'warn' | 'error';

export interface DiagnosticCodeSpec {
  /** Human-readable description for audits and tooling. */
  readonly description: string;
  /** Severity classification for tooling and reporting. */
  readonly severity: DiagnosticSeverity;
  /**
   * Shape contract for diagnostic payloads.
   * Use an object schema-like structure (type-level) to keep payloads deterministic.
   */
  readonly shape: Record<string, unknown>;
}

/**
 * Registry of diagnostic codes.
 *
 * Start empty and add codes intentionally (contract-sensitive).
 */
export const DIAGNOSTIC_CODES = {} as const satisfies Record<string, DiagnosticCodeSpec>;
