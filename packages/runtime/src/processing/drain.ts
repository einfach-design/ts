/**
 * @file packages/runtime/src/processing/drain.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

export type DrainAbortPhase = "process";

export type DrainAbortInfo = Readonly<{
  atCursor: number;
  phase: DrainAbortPhase;
  error: unknown;
}>;

export type DrainOptions<TEntry> = Readonly<{
  entries: readonly TEntry[];
  cursor: number;
  draining: boolean;
  process: (entry: TEntry, index: number) => void;
  onAbort?: (info: DrainAbortInfo) => void;
}>;

export type DrainResult = Readonly<{
  cursor: number;
  draining: boolean;
  aborted: boolean;
}>;

/**
 * Drain-loop / scheduler mechanics.
 */
export function drain<TEntry>(opts: DrainOptions<TEntry>): DrainResult {
  if (opts.draining) {
    return {
      cursor: opts.cursor,
      draining: true,
      aborted: false,
    };
  }

  for (let index = opts.cursor; index < opts.entries.length; index += 1) {
    const entry = opts.entries[index] as TEntry;

    try {
      opts.process(entry, index);
    } catch (error: unknown) {
      opts.onAbort?.({
        atCursor: index,
        phase: "process",
        error,
      });

      return {
        cursor: Math.min(index + 1, opts.entries.length),
        draining: false,
        aborted: true,
      };
    }
  }

  return {
    cursor: opts.entries.length,
    draining: false,
    aborted: false,
  };
}
