import { toBackfillQSnapshot } from "../../state/backfillQ.js";
import { computeChangedFlags } from "../../state/changedFlags.js";
import { createFlagsView, type FlagsView } from "../../state/flagsView.js";
import { extendSeenSignals, projectSignal } from "../../state/signals.js";
import type { ImpulseQEntryCanonical } from "../../canon/impulseEntry.js";
import { snapshot } from "../util.js";
import type { RuntimeStore } from "../store.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import type { RegistryStore } from "../../state/registry.js";
import type { RegisteredExpression } from "../../runs/coreRun.js";

export const snapshotGetKeys = [
  "defaults",
  "flags",
  "changedFlags",
  "seenFlags",
  "signal",
  "seenSignals",
  "impulseQ",
  "backfillQ",
] as const;

export const debugGetKeys = [
  "scopeProjectionBaseline",
  "registeredQ",
  "registeredById",
  "diagnostics",
] as const;

const allowedGetKeys = ["*", ...snapshotGetKeys, ...debugGetKeys] as const;

type AllowedGetKey = (typeof allowedGetKeys)[number];
type Scope = "applied" | "pending" | "pendingOnly";

type ProjectionState = {
  flags: FlagsView;
  changedFlags: FlagsView | undefined;
  seenFlags: FlagsView;
  signal: string | undefined;
  seenSignals: RuntimeStore["seenSignals"];
};

const resolveScope = (scope: string | undefined): Scope => {
  if (scope === "applied" || scope === "pendingOnly") {
    return scope;
  }

  return "pending";
};

const projectFlagsState = (
  entries: readonly ImpulseQEntryCanonical[],
  initialState: ProjectionState,
): ProjectionState => {
  let flags = initialState.flags;
  let changedFlags = initialState.changedFlags;
  let seenFlags = initialState.seenFlags;
  let signal = initialState.signal;
  let seenSignals = initialState.seenSignals;

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

const getProjectionSeed = (
  store: RuntimeStore,
  scope: Scope,
): ProjectionState => {
  if (scope === "pendingOnly") {
    return {
      flags: createFlagsView([]),
      changedFlags: createFlagsView([]),
      seenFlags: createFlagsView([]),
      signal: undefined,
      seenSignals: { list: [], map: {} },
    };
  }

  return store.scopeProjectionBaseline;
};

const wantsScopeProjectionForKey = (resolvedKey: string): boolean =>
  resolvedKey === "*" ||
  resolvedKey === "flags" ||
  resolvedKey === "changedFlags" ||
  resolvedKey === "seenFlags" ||
  resolvedKey === "signal" ||
  resolvedKey === "seenSignals" ||
  resolvedKey === "impulseQ";

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
    diagnostics.emit({
      code: "get.key.invalid",
      message: "Unknown run.get key.",
      severity: "error",
      data: { key: resolvedKey },
    });
    throw new Error("get.key.invalid");
  }

  return store.withRuntimeStack(() => {
    const as = opts?.as ?? "snapshot";
    const wantsScopeProjection =
      opts?.scope !== undefined && wantsScopeProjectionForKey(resolvedKey);

    let selectedFlags = store.flagsTruth;
    let selectedChangedFlags = store.changedFlags;
    let selectedSeenFlags = store.seenFlags;
    let selectedSignal = store.signal;
    let selectedSeenSignals = store.seenSignals;
    let selectedImpulseQ = store.impulseQ;

    if (wantsScopeProjection) {
      const scope = resolveScope(opts?.scope);
      const projectedImpulseQ = projectImpulseQ(store.impulseQ, scope);
      const projectedFlagsState = projectFlagsState(
        projectedImpulseQ.q.entries,
        getProjectionSeed(store, scope),
      );

      selectedFlags = projectedFlagsState.flags;
      selectedChangedFlags = projectedFlagsState.changedFlags;
      selectedSeenFlags = projectedFlagsState.seenFlags;
      selectedSignal = projectedFlagsState.signal;
      selectedSeenSignals = projectedFlagsState.seenSignals;
      selectedImpulseQ = projectedImpulseQ;
    }

    const selectedDiagnostics = diagnostics.list();

    const valueByKey: Record<AllowedGetKey, unknown> = {
      defaults: store.defaults,
      flags: selectedFlags,
      changedFlags: selectedChangedFlags,
      seenFlags: selectedSeenFlags,
      signal: selectedSignal,
      seenSignals: selectedSeenSignals,
      scopeProjectionBaseline: store.scopeProjectionBaseline,
      impulseQ: selectedImpulseQ,
      backfillQ: toBackfillQSnapshot(store.backfillQ),
      registeredQ: expressionRegistry.registeredQ,
      registeredById: expressionRegistry.registeredById,
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
      },
    };

    const selected =
      key !== undefined
        ? valueByKey[resolvedKey as AllowedGetKey]
        : valueByKey["*"];
    if (as === "reference") {
      return selected;
    }

    return snapshot(selected);
  });
}
