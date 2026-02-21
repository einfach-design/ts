/**
 * @file packages/runtime/src/processing/trim.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

export type TrimReason = "retain" | "maxBytes";

export type TrimStats = Readonly<{
  reason: TrimReason;
  bytesFreed?: number;
}>;

export type TrimInfo<TEntry> = Readonly<{
  entries: readonly TEntry[];
  stats: TrimStats;
}>;

export type TrimEvent = Readonly<{
  reason: TrimReason;
  removedCount: number;
  cursorDelta: number;
}>;

export type TrimOptions<TEntry> = Readonly<{
  entries: readonly TEntry[];
  cursor: number;
  retain?: number | boolean;
  maxBytes?: number;
  runtimeStackActive: boolean;
  trimPendingMaxBytes: boolean;
  measureBytes: (entry: TEntry) => number;
  onTrim?: (info: TrimInfo<TEntry>) => void;
}>;

export type TrimResult<TEntry> = Readonly<{
  entries: readonly TEntry[];
  cursor: number;
  trimPendingMaxBytes: boolean;
  events: readonly TrimEvent[];
  onTrimError: unknown | undefined;
}>;

function canonicalRetain(retain: number | boolean | undefined): number {
  if (retain === true) {
    return Number.POSITIVE_INFINITY;
  }

  if (retain === false || retain === undefined) {
    return 0;
  }

  if (typeof retain === "number" && Number.isFinite(retain)) {
    return Math.max(0, Math.floor(retain));
  }

  return 0;
}

function canonicalMaxBytes(maxBytes: number | undefined): number {
  if (maxBytes === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  if (typeof maxBytes === "number" && Number.isFinite(maxBytes)) {
    return Math.max(0, Math.floor(maxBytes));
  }

  return Number.POSITIVE_INFINITY;
}

function appliedBytes<TEntry>(
  entries: readonly TEntry[],
  measureBytes: (entry: TEntry) => number,
): number {
  return entries.reduce(
    (sum, entry) => sum + Math.max(0, measureBytes(entry)),
    0,
  );
}

/**
 * Trim mechanics: retain/maxBytes/defer/onTrim ordering.
 */
export function trim<TEntry>(opts: TrimOptions<TEntry>): TrimResult<TEntry> {
  const retain = canonicalRetain(opts.retain);
  const maxBytes = canonicalMaxBytes(opts.maxBytes);

  const applied = opts.entries.slice(0, opts.cursor);
  const pending = opts.entries.slice(opts.cursor);
  const events: TrimEvent[] = [];
  let onTrimError: unknown | undefined;
  let cursorDelta = 0;
  let pendingMaxBytes = false;

  const retainOverflow = Math.max(0, applied.length - retain);
  if (retainOverflow > 0) {
    const removed = applied.slice(0, retainOverflow);
    const bytesFreed = appliedBytes(removed, opts.measureBytes);

    if (opts.onTrim !== undefined) {
      try {
        opts.onTrim({
          entries: removed,
          stats: {
            reason: "retain",
            bytesFreed,
          },
        });
      } catch (error) {
        onTrimError ??= error;
      }
    }

    applied.splice(0, retainOverflow);
    cursorDelta += retainOverflow;
    events.push({
      reason: "retain",
      removedCount: removed.length,
      cursorDelta: retainOverflow,
    });
  }

  if (maxBytes !== Number.POSITIVE_INFINITY) {
    const bytes = appliedBytes(applied, opts.measureBytes);

    if (bytes > maxBytes) {
      if (opts.runtimeStackActive) {
        pendingMaxBytes = true;
      } else {
        let index = 0;
        let remaining = bytes;
        let bytesFreed = 0;

        while (index < applied.length && remaining > maxBytes) {
          const entryBytes = Math.max(
            0,
            opts.measureBytes(applied[index] as TEntry),
          );
          remaining -= entryBytes;
          bytesFreed += entryBytes;
          index += 1;
        }

        if (index > 0) {
          const removed = applied.slice(0, index);

          if (opts.onTrim !== undefined) {
            try {
              opts.onTrim({
                entries: removed,
                stats: {
                  reason: "maxBytes",
                  bytesFreed,
                },
              });
            } catch (error) {
              onTrimError ??= error;
            }
          }

          applied.splice(0, index);
          cursorDelta += index;
          events.push({
            reason: "maxBytes",
            removedCount: removed.length,
            cursorDelta: index,
          });
        }
      }
    }
  }

  return {
    entries: [...applied, ...pending],
    cursor: opts.cursor - cursorDelta,
    trimPendingMaxBytes: pendingMaxBytes,
    events,
    onTrimError,
  };
}
