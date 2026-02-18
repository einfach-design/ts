import { type ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import { trim } from "../processing/trim.js";
import {
  createBackfillQ,
  type BackfillExpression,
  type BackfillQ,
} from "../state/backfillQ.js";
import { computeChangedFlags } from "../state/changedFlags.js";
import { globalDefaults, type Defaults } from "../state/defaults.js";
import { createFlagsView, type FlagsView } from "../state/flagsView.js";
import {
  extendSeenSignals,
  projectSignal,
  type SeenSignals,
} from "../state/signals.js";
import { measureEntryBytes } from "./util.js";

type ImpulseQOnTrim = (info: {
  entries: readonly ImpulseQEntryCanonical[];
  stats: { reason: "retain" | "maxBytes"; bytesFreed?: number };
}) => void;

export type RuntimeOnError =
  | "throw"
  | "report"
  | "swallow"
  | ((error: unknown) => void);

type ImpulseQOnError = RuntimeOnError;

export type RuntimeStore<
  TExpression extends BackfillExpression = BackfillExpression,
> = {
  defaults: Defaults;
  flagsTruth: FlagsView;
  changedFlags: FlagsView | undefined;
  seenFlags: FlagsView;

  signal: string | undefined;
  seenSignals: SeenSignals;

  baselineFlagsTruth: FlagsView;
  baselineChangedFlags: FlagsView | undefined;
  baselineSeenFlags: FlagsView;
  baselineSignal: string | undefined;
  baselineSeenSignals: SeenSignals;

  backfillQ: BackfillQ<TExpression>;

  impulseQ: {
    q: { entries: ImpulseQEntryCanonical[]; cursor: number };
    config: {
      retain: number | boolean;
      maxBytes: number;
      onTrim: ImpulseQOnTrim | undefined;
      onError: ImpulseQOnError | undefined;
    };
  };

  draining: boolean;
  trimPendingMaxBytes: boolean;
  runtimeStackDepth: number;

  withRuntimeStack: <T>(fn: () => T) => T;
  advanceProjectionBaseline: (
    entries: readonly ImpulseQEntryCanonical[],
  ) => void;
};

export function initRuntimeStore<
  TExpression extends BackfillExpression = BackfillExpression,
>(): RuntimeStore<TExpression> {
  let defaults: Defaults = globalDefaults;
  let flagsTruth: FlagsView = createFlagsView([]);
  let changedFlags: FlagsView | undefined;
  let seenFlags: FlagsView = createFlagsView([]);

  let signal: string | undefined;
  let seenSignals: SeenSignals = { list: [], map: {} };

  let baselineFlagsTruth: FlagsView = createFlagsView([]);
  let baselineChangedFlags: FlagsView | undefined;
  let baselineSeenFlags: FlagsView = createFlagsView([]);
  let baselineSignal: string | undefined;
  let baselineSeenSignals: SeenSignals = { list: [], map: {} };

  let backfillQ = createBackfillQ<TExpression>();

  const impulseQ: {
    q: { entries: ImpulseQEntryCanonical[]; cursor: number };
    config: {
      retain: number | boolean;
      maxBytes: number;
      onTrim: ImpulseQOnTrim | undefined;
      onError: ImpulseQOnError | undefined;
    };
  } = {
    q: { entries: [], cursor: 0 },
    config: {
      retain: 0,
      maxBytes: Number.POSITIVE_INFINITY,
      onTrim: undefined,
      onError: undefined,
    },
  };

  let draining = false;
  let trimPendingMaxBytes = false;
  let runtimeStackDepth = 0;

  const advanceProjectionBaseline = (
    entries: readonly ImpulseQEntryCanonical[],
  ): void => {
    for (const entry of entries) {
      const nextMap: Record<string, true> = { ...baselineFlagsTruth.map };
      const removeSet = new Set(entry.removeFlags);

      for (const flag of entry.removeFlags) {
        delete nextMap[flag];
      }

      for (const flag of entry.addFlags) {
        if (removeSet.has(flag)) continue;
        nextMap[flag] = true;
      }

      const nextFlags = createFlagsView(Object.keys(nextMap));
      baselineChangedFlags = computeChangedFlags(
        baselineFlagsTruth,
        nextFlags,
        entry.removeFlags,
        entry.addFlags,
      );
      baselineFlagsTruth = nextFlags;
      baselineSeenFlags = createFlagsView([
        ...baselineSeenFlags.list,
        ...baselineFlagsTruth.list,
      ]);

      baselineSignal = projectSignal(entry.signals);
      baselineSeenSignals = extendSeenSignals(
        baselineSeenSignals,
        entry.signals,
      );
    }
  };

  const collectTrimmedAppliedEntries = (
    entries: readonly ImpulseQEntryCanonical[],
    cursor: number,
    events: readonly { cursorDelta: number; removedCount: number }[],
  ): ImpulseQEntryCanonical[] => {
    if (events.length === 0) {
      return [];
    }

    const applied = entries.slice(0, cursor);
    const removed: ImpulseQEntryCanonical[] = [];
    let removedOffset = 0;

    for (const event of events) {
      if (event.cursorDelta <= 0 || event.removedCount <= 0) {
        continue;
      }

      removed.push(
        ...applied.slice(removedOffset, removedOffset + event.removedCount),
      );
      removedOffset += event.removedCount;
    }

    return removed;
  };

  const withRuntimeStack = <T>(fn: () => T): T => {
    runtimeStackDepth += 1;
    try {
      return fn();
    } finally {
      runtimeStackDepth -= 1;
      if (runtimeStackDepth === 0 && trimPendingMaxBytes) {
        const entriesBeforeTrim = [...impulseQ.q.entries];
        const cursorBeforeTrim = impulseQ.q.cursor;
        const trimmed = trim({
          entries: impulseQ.q.entries,
          cursor: impulseQ.q.cursor,
          retain: impulseQ.config.retain,
          maxBytes: impulseQ.config.maxBytes,
          runtimeStackActive: false,
          trimPendingMaxBytes,
          measureBytes: measureEntryBytes,
        });
        advanceProjectionBaseline(
          collectTrimmedAppliedEntries(
            entriesBeforeTrim,
            cursorBeforeTrim,
            trimmed.events,
          ),
        );
        impulseQ.q.entries = [...trimmed.entries];
        impulseQ.q.cursor = trimmed.cursor;
        trimPendingMaxBytes = trimmed.trimPendingMaxBytes;
      }
    }
  };

  const store: RuntimeStore<TExpression> = {
    get defaults() {
      return defaults;
    },
    set defaults(value) {
      defaults = value;
    },

    get flagsTruth() {
      return flagsTruth;
    },
    set flagsTruth(value) {
      flagsTruth = value;
    },

    get changedFlags() {
      return changedFlags;
    },
    set changedFlags(value) {
      changedFlags = value;
    },

    get seenFlags() {
      return seenFlags;
    },
    set seenFlags(value) {
      seenFlags = value;
    },

    get signal() {
      return signal;
    },
    set signal(value) {
      signal = value;
    },

    get seenSignals() {
      return seenSignals;
    },
    set seenSignals(value) {
      seenSignals = value;
    },

    get baselineFlagsTruth() {
      return baselineFlagsTruth;
    },
    set baselineFlagsTruth(value) {
      baselineFlagsTruth = value;
    },

    get baselineChangedFlags() {
      return baselineChangedFlags;
    },
    set baselineChangedFlags(value) {
      baselineChangedFlags = value;
    },

    get baselineSeenFlags() {
      return baselineSeenFlags;
    },
    set baselineSeenFlags(value) {
      baselineSeenFlags = value;
    },

    get baselineSignal() {
      return baselineSignal;
    },
    set baselineSignal(value) {
      baselineSignal = value;
    },

    get baselineSeenSignals() {
      return baselineSeenSignals;
    },
    set baselineSeenSignals(value) {
      baselineSeenSignals = value;
    },

    get backfillQ() {
      return backfillQ;
    },
    set backfillQ(value) {
      backfillQ = value;
    },

    impulseQ,

    get draining() {
      return draining;
    },
    set draining(value) {
      draining = value;
    },

    get trimPendingMaxBytes() {
      return trimPendingMaxBytes;
    },
    set trimPendingMaxBytes(value) {
      trimPendingMaxBytes = value;
    },

    get runtimeStackDepth() {
      return runtimeStackDepth;
    },
    set runtimeStackDepth(value) {
      runtimeStackDepth = value;
    },

    withRuntimeStack,
    advanceProjectionBaseline,
  };

  return store;
}
