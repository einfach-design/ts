import { toBackfillQSnapshot } from "../../state/backfillQ.js";
import { computeChangedFlags } from "../../state/changedFlags.js";
import { createFlagsView, type FlagsView } from "../../state/flagsView.js";
import { extendSeenSignals, projectSignal } from "../../state/signals.js";
import type { ImpulseQEntryCanonical } from "../../canon/impulseEntry.js";
import { readonlyReference, snapshot } from "../util.js";
import type { RuntimeStore } from "../store.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import type { RegistryStore } from "../../state/registry.js";

const allowedGetKeys = [
  "*",
  "defaults",
  "flags",
  "changedFlags",
  "seenFlags",
  "signal",
  "seenSignals",
  "impulseQ",
  "backfillQ",
  "registeredQ",
  "diagnostics",
] as const;

type AllowedGetKey = (typeof allowedGetKeys)[number];
type Scope = "applied" | "pending" | "pendingOnly";

type RegisteredExpression = { id: string; tombstone?: true };

const resolveScope = (scope: string | undefined): Scope => {
  if (scope === "applied" || scope === "pendingOnly") {
    return scope;
  }

  return "pending";
};

const projectFlagsState = (
  entries: readonly ImpulseQEntryCanonical[],
): {
  flags: FlagsView;
  changedFlags: FlagsView | undefined;
  seenFlags: FlagsView;
  signal: string | undefined;
  seenSignals: RuntimeStore["seenSignals"];
} => {
  let flags = createFlagsView([]);
  let changedFlags: FlagsView | undefined;
  let seenFlags = createFlagsView([]);
  let signal: string | undefined;
  let seenSignals: RuntimeStore["seenSignals"] = { list: [], map: {} };

  for (const entry of entries) {
    const nextMap: Record<string, true> = { ...flags.map };
    const removeSet = new Set(entry.removeFlags);

    for (const flag of entry.removeFlags) {
      delete nextMap[flag];
    }

    for (const flag of entry.addFlags) {
      if (removeSet.has(flag)) continue;
      nextMap[flag] = true;
    }

    const nextFlags = createFlagsView(Object.keys(nextMap));

    changedFlags = computeChangedFlags(
      flags,
      nextFlags,
      entry.removeFlags,
      entry.addFlags,
    );
    flags = nextFlags;
    seenFlags = createFlagsView([...seenFlags.list, ...flags.list]);

    signal = projectSignal(entry.signals);
    seenSignals = extendSeenSignals(seenSignals, entry.signals);
  }

  return {
    flags,
    changedFlags,
    seenFlags,
    signal,
    seenSignals,
  };
};

const projectImpulseQ = (
  impulseQ: RuntimeStore["impulseQ"],
  scope: Scope,
): RuntimeStore["impulseQ"] => {
  if (scope === "pending") {
    return impulseQ;
  }

  if (scope === "applied") {
    return {
      config: impulseQ.config,
      q: {
        cursor: impulseQ.q.cursor,
        entries: impulseQ.q.entries.slice(0, impulseQ.q.cursor),
      },
    };
  }

  return {
    config: impulseQ.config,
    q: {
      cursor: 0,
      entries: impulseQ.q.entries.slice(impulseQ.q.cursor),
    },
  };
};

export function runGet(
  store: RuntimeStore,
  {
    expressionRegistry,
    diagnostics,
  }: {
    expressionRegistry: RegistryStore<RegisteredExpression>;
    diagnostics: DiagnosticCollector;
  },
  key?: string,
  opts?: { as?: "snapshot" | "reference"; scope?: string },
): unknown {
  const resolvedKey = (key ?? "*") as string;

  if (
    key !== undefined &&
    !(allowedGetKeys as readonly string[]).includes(resolvedKey)
  ) {
    throw new Error("get.key.invalid");
  }

  return store.withRuntimeStack(() => {
    const as = opts?.as ?? "snapshot";
    const hasScopedProjection = opts?.scope !== undefined;
    const scope = resolveScope(opts?.scope);
    const projectedImpulseQ = projectImpulseQ(store.impulseQ, scope);
    const projectedFlagsState = projectFlagsState(projectedImpulseQ.q.entries);
    const selectedFlags = hasScopedProjection
      ? projectedFlagsState.flags
      : store.flagsTruth;
    const selectedChangedFlags = hasScopedProjection
      ? projectedFlagsState.changedFlags
      : store.changedFlags;
    const selectedSeenFlags = hasScopedProjection
      ? projectedFlagsState.seenFlags
      : store.seenFlags;
    const selectedSignal = hasScopedProjection
      ? projectedFlagsState.signal
      : store.signal;
    const selectedSeenSignals = hasScopedProjection
      ? projectedFlagsState.seenSignals
      : store.seenSignals;
    const selectedImpulseQ = hasScopedProjection
      ? projectedImpulseQ
      : store.impulseQ;
    const selectedDiagnostics = diagnostics.list();

    const valueByKey: Record<AllowedGetKey, unknown> = {
      defaults: store.defaults,
      flags: selectedFlags,
      changedFlags: selectedChangedFlags,
      seenFlags: selectedSeenFlags,
      signal: selectedSignal,
      seenSignals: selectedSeenSignals,
      impulseQ: selectedImpulseQ,
      backfillQ: toBackfillQSnapshot(store.backfillQ),
      registeredQ: expressionRegistry.registeredQ,
      diagnostics: selectedDiagnostics,
      "*": {
        defaults: store.defaults,
        flags: selectedFlags,
        changedFlags: selectedChangedFlags,
        seenFlags: selectedSeenFlags,
        signal: selectedSignal,
        seenSignals: selectedSeenSignals,
        impulseQ: selectedImpulseQ,
        backfillQ: toBackfillQSnapshot(store.backfillQ),
        registeredQ: expressionRegistry.registeredQ,
        diagnostics: selectedDiagnostics,
      },
    };

    const selected =
      key !== undefined
        ? valueByKey[resolvedKey as AllowedGetKey]
        : valueByKey["*"];
    if (as === "reference") {
      return readonlyReference(selected);
    }

    return snapshot(selected);
  });
}
