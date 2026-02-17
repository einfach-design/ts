import { type ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import { trim } from "../processing/trim.js";
import {
  createBackfillQ,
  type BackfillExpression,
  type BackfillQ,
} from "../state/backfillQ.js";
import { globalDefaults, type Defaults } from "../state/defaults.js";
import { createFlagsView, type FlagsView } from "../state/flagsView.js";
import { type SeenSignals } from "../state/signals.js";
import { measureEntryBytes } from "./util.js";

export type RuntimeStore<
  TExpression extends BackfillExpression = BackfillExpression,
> = {
  defaults: Defaults;
  flagsTruth: FlagsView;
  changedFlags: FlagsView | undefined;
  seenFlags: FlagsView;

  signal: string | undefined;
  seenSignals: SeenSignals;

  backfillQ: BackfillQ<TExpression>;

  impulseQ: {
    q: { entries: ImpulseQEntryCanonical[]; cursor: number };
    config: { retain: number | boolean; maxBytes: number };
  };

  draining: boolean;
  trimPendingMaxBytes: boolean;
  runtimeStackDepth: number;

  withRuntimeStack: <T>(fn: () => T) => T;
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

  let backfillQ = createBackfillQ<TExpression>();

  const impulseQ: {
    q: { entries: ImpulseQEntryCanonical[]; cursor: number };
    config: { retain: number | boolean; maxBytes: number };
  } = {
    q: { entries: [], cursor: 0 },
    config: { retain: 0, maxBytes: Number.POSITIVE_INFINITY },
  };

  let draining = false;
  let trimPendingMaxBytes = false;
  let runtimeStackDepth = 0;

  const withRuntimeStack = <T>(fn: () => T): T => {
    runtimeStackDepth += 1;
    try {
      return fn();
    } finally {
      runtimeStackDepth -= 1;
      if (runtimeStackDepth === 0 && trimPendingMaxBytes) {
        const trimmed = trim({
          entries: impulseQ.q.entries,
          cursor: impulseQ.q.cursor,
          retain: impulseQ.config.retain,
          maxBytes: impulseQ.config.maxBytes,
          runtimeStackActive: false,
          trimPendingMaxBytes,
          measureBytes: measureEntryBytes,
        });
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
  };

  return store;
}
