/**
 * @file packages/runtime/src/processing/actImpulse.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Impulse application mechanics (occurrence construction).
 */

export type ActOccurrence = Readonly<{
  index: number;
  signal?: string;
  payload?: unknown;
}>;

export type ActImpulseEntry = Readonly<{
  signals: readonly string[];
  livePayload?: unknown;
}>;

export type ActImpulseOptions = Readonly<{
  entry: ActImpulseEntry;
  hasBackfill: boolean;
  runRegistered: (occurrence: ActOccurrence) => void;
  runBackfill?: (occurrence: ActOccurrence) => void;
}>;

export type ActImpulseResult = Readonly<{
  occurrences: readonly ActOccurrence[];
}>;

/**
 * Impulse application mechanics (occurrence construction + deterministic run sequencing).
 *
 * Sequencing per occurrence:
 * - when `hasBackfill === true`: exactly one backfill run, then exactly one registered run.
 * - otherwise: exactly one registered run.
 */
export function actImpulse(opts: ActImpulseOptions): ActImpulseResult {
  const signals = opts.entry.signals;
  const sequence = signals.length > 0 ? signals : [undefined];

  const occurrences: ActOccurrence[] = [];

  for (const [index, signal] of sequence.entries()) {
    const occurrence: ActOccurrence = {
      index,
      ...(signal !== undefined ? { signal } : {}),
      ...(Object.prototype.hasOwnProperty.call(opts.entry, "livePayload")
        ? { payload: opts.entry.livePayload }
        : {}),
    };

    occurrences.push(occurrence);

    if (opts.hasBackfill) {
      opts.runBackfill?.(occurrence);
    }

    opts.runRegistered(occurrence);
  }

  return {
    occurrences,
  };
}
