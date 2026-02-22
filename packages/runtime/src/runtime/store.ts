import { type ImpulseQEntryCanonical } from "../canon/impulseEntry.js";
import { trim } from "../processing/trim.js";
import {
  createBackfillQ,
  type BackfillExpression,
  type BackfillQ,
} from "../state/backfillQ.js";
import { computeChangedFlags } from "../state/changedFlags.js";
import { globalDefaults, type Defaults } from "../state/defaults.js";
import {
  applyFlagDeltas,
  createFlagsView,
  extendSeenFlags,
  type FlagsView,
} from "../state/flagsView.js";
import {
  extendSeenSignals,
  projectSignal,
  type SeenSignals,
} from "../state/signals.js";
import { createNullProtoRecord } from "../util/nullProto.js";
import { measureEntryBytes } from "./util.js";
import type { DiagnosticCollector } from "../diagnostics/index.js";
import type { RuntimeErrorContext } from "../index.types.js";

export type RuntimeErrorPhase =
  | "impulse/drain"
  | "impulse/canon"
  | "diagnostic/listener"
  | "trim/onTrim"
  | "set/hydration"
  | "set/hydration/backfillQ"
  | "target/callback"
  | "target/object";

type ImpulseQOnTrim = (info: {
  entries: readonly ImpulseQEntryCanonical[];
  stats: { reason: "retain" | "maxBytes"; bytesFreed?: number };
}) => void;

export type RuntimeOnError =
  | "throw"
  | "report"
  | "swallow"
  | ((error: unknown, ctx: RuntimeErrorContext) => void);

type ImpulseQOnError = RuntimeOnError;

export type ScopeProjectionBaseline = {
  flags: FlagsView;
  changedFlags: FlagsView | undefined;
  seenFlags: FlagsView;
  signal: string | undefined;
  seenSignals: SeenSignals;
};

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
    config: {
      retain: number | boolean;
      maxBytes: number;
      onTrim: ImpulseQOnTrim | undefined;
      onError: ImpulseQOnError | undefined;
    };
  };

  scopeProjectionBaseline: ScopeProjectionBaseline;
  applyTrimmedAppliedEntriesToScopeBaseline: (
    entries: readonly ImpulseQEntryCanonical[],
  ) => void;
  resetScopeProjectionBaseline: () => void;

  draining: boolean;
  trimPendingMaxBytes: boolean;
  runtimeStackDepth: number;

  withRuntimeStack: <T>(fn: () => T) => T;
  diagnostics: DiagnosticCollector | undefined;
  reportRuntimeError: (
    error: unknown,
    phase: RuntimeErrorPhase,
    extraData?: Record<string, unknown>,
    modeOverride?: RuntimeOnError,
  ) => void;
  activeOuterOnError: RuntimeOnError | undefined;
};

export function initRuntimeStore<
  TExpression extends BackfillExpression = BackfillExpression,
>(): RuntimeStore<TExpression> {
  let defaults: Defaults = {
    scope: {
      signal: { ...globalDefaults.scope.signal },
      flags: { ...globalDefaults.scope.flags },
    },
    gate: {
      signal: { ...globalDefaults.gate.signal },
      flags: { ...globalDefaults.gate.flags },
    },
    methods: {
      on: { ...globalDefaults.methods.on },
      when: { ...globalDefaults.methods.when },
    },
  };
  let flagsTruth: FlagsView = createFlagsView([]);
  let changedFlags: FlagsView | undefined;
  let seenFlags: FlagsView = createFlagsView([]);

  let signal: string | undefined;
  let seenSignals: SeenSignals = {
    list: [],
    map: createNullProtoRecord<true>(),
  };

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

  let scopeProjectionBaseline: ScopeProjectionBaseline = {
    flags: createFlagsView([]),
    changedFlags: undefined,
    seenFlags: createFlagsView([]),
    signal: undefined,
    seenSignals: { list: [], map: createNullProtoRecord<true>() },
  };

  const applyTrimmedAppliedEntriesToScopeBaseline = (
    entries: readonly ImpulseQEntryCanonical[],
  ): void => {
    for (const entry of entries) {
      const nextFlags = applyFlagDeltas(
        scopeProjectionBaseline.flags,
        entry.addFlags,
        entry.removeFlags,
      );

      scopeProjectionBaseline = {
        flags: nextFlags,
        changedFlags: computeChangedFlags(
          scopeProjectionBaseline.flags,
          nextFlags,
          entry.removeFlags,
          entry.addFlags,
        ),
        seenFlags: extendSeenFlags(
          scopeProjectionBaseline.seenFlags,
          nextFlags.list,
        ),
        signal: projectSignal(entry.signals),
        seenSignals: extendSeenSignals(
          scopeProjectionBaseline.seenSignals,
          entry.signals,
        ),
      };
    }
  };

  const resetScopeProjectionBaseline = (): void => {
    scopeProjectionBaseline = {
      flags: createFlagsView([]),
      changedFlags: undefined,
      seenFlags: createFlagsView([]),
      signal: undefined,
      seenSignals: { list: [], map: createNullProtoRecord<true>() },
    };
  };

  let draining = false;
  let trimPendingMaxBytes = false;
  let runtimeStackDepth = 0;

  const withRuntimeStack = <T>(fn: () => T): T => {
    runtimeStackDepth += 1;
    try {
      return fn();
    } finally {
      if (runtimeStackDepth === 1 && trimPendingMaxBytes && !draining) {
        const prevEntries = impulseQ.q.entries;
        const prevCursor = impulseQ.q.cursor;
        const prevPendingCount = Math.max(0, prevEntries.length - prevCursor);
        const drainingBeforeTrim = draining;
        draining = true;
        try {
          const trimmed = trim({
            entries: prevEntries,
            cursor: prevCursor,
            retain: impulseQ.config.retain,
            maxBytes: impulseQ.config.maxBytes,
            runtimeStackActive: false,
            trimPendingMaxBytes,
            measureBytes: measureEntryBytes,
            ...(impulseQ.config.onTrim !== undefined
              ? { onTrim: impulseQ.config.onTrim }
              : {}),
          });

          if (trimmed.onTrimError !== undefined) {
            store.reportRuntimeError(trimmed.onTrimError, "trim/onTrim");
          }

          const removedCount = Math.max(0, prevCursor - trimmed.cursor);
          if (removedCount > 0) {
            applyTrimmedAppliedEntriesToScopeBaseline(
              prevEntries.slice(0, removedCount),
            );
          }

          const pendingEntriesEnqueuedDuringTrim =
            impulseQ.q.entries.length > prevCursor + prevPendingCount
              ? impulseQ.q.entries.slice(prevCursor + prevPendingCount)
              : [];

          impulseQ.q.entries = [
            ...trimmed.entries,
            ...pendingEntriesEnqueuedDuringTrim,
          ];
          impulseQ.q.cursor = trimmed.cursor;
          trimPendingMaxBytes = trimmed.trimPendingMaxBytes;
        } finally {
          draining = drainingBeforeTrim;
        }
      }

      runtimeStackDepth -= 1;
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

    get scopeProjectionBaseline() {
      return scopeProjectionBaseline;
    },
    set scopeProjectionBaseline(value) {
      scopeProjectionBaseline = value;
    },

    applyTrimmedAppliedEntriesToScopeBaseline,
    resetScopeProjectionBaseline,

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
    diagnostics: undefined,
    activeOuterOnError: undefined,
    reportRuntimeError(error, phase, extraData, modeOverride) {
      const diagnostics = this.diagnostics;
      const mode =
        modeOverride ??
        this.activeOuterOnError ??
        this.impulseQ.config.onError ??
        "report";

      const isTargetPhase =
        phase === "target/callback" || phase === "target/object";
      const code = isTargetPhase
        ? "runtime.target.error"
        : "runtime.onError.report";

      if (typeof mode === "function") {
        mode(error, {
          phase,
          ...(extraData ?? {}),
        });
        return;
      }

      if (mode === "report") {
        diagnostics?.emit({
          code,
          message: error instanceof Error ? error.message : "Runtime error",
          severity: "error",
          data: {
            phase,
            ...(extraData ?? {}),
          },
        });
        return;
      }

      if (mode === "swallow") {
        return;
      }

      if (mode === "throw") {
        throw error;
      }
    },
  };

  return store;
}
