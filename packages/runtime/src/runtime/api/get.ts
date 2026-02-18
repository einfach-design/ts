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
    let projectedImpulseQ: RuntimeStore["impulseQ"] | undefined;
    let projectedFlagsState: ReturnType<typeof projectFlagsState> | undefined;

    const readProjectedImpulseQ = (): RuntimeStore["impulseQ"] => {
      if (!hasScopedProjection) {
        return store.impulseQ;
      }

      projectedImpulseQ ??= projectImpulseQ(store.impulseQ, scope);
      return projectedImpulseQ;
    };

    const readProjectedFlagsState = (): ReturnType<
      typeof projectFlagsState
    > => {
      projectedFlagsState ??= projectFlagsState(
        readProjectedImpulseQ().q.entries,
      );
      return projectedFlagsState;
    };

    const selectedKey = (key ?? "*") as AllowedGetKey;
    let selected: unknown;

    switch (selectedKey) {
      case "defaults":
        selected = store.defaults;
        break;
      case "flags":
        selected = hasScopedProjection
          ? readProjectedFlagsState().flags
          : store.flagsTruth;
        break;
      case "changedFlags":
        selected = hasScopedProjection
          ? readProjectedFlagsState().changedFlags
          : store.changedFlags;
        break;
      case "seenFlags":
        selected = hasScopedProjection
          ? readProjectedFlagsState().seenFlags
          : store.seenFlags;
        break;
      case "signal":
        selected = hasScopedProjection
          ? readProjectedFlagsState().signal
          : store.signal;
        break;
      case "seenSignals":
        selected = hasScopedProjection
          ? readProjectedFlagsState().seenSignals
          : store.seenSignals;
        break;
      case "impulseQ":
        selected = hasScopedProjection
          ? readProjectedImpulseQ()
          : store.impulseQ;
        break;
      case "backfillQ":
        selected = toBackfillQSnapshot(store.backfillQ);
        break;
      case "registeredQ":
        selected = expressionRegistry.registeredQ;
        break;
      case "diagnostics":
        selected = diagnostics.list();
        break;
      case "*":
        selected = {
          defaults: store.defaults,
          flags: hasScopedProjection
            ? readProjectedFlagsState().flags
            : store.flagsTruth,
          changedFlags: hasScopedProjection
            ? readProjectedFlagsState().changedFlags
            : store.changedFlags,
          seenFlags: hasScopedProjection
            ? readProjectedFlagsState().seenFlags
            : store.seenFlags,
          signal: hasScopedProjection
            ? readProjectedFlagsState().signal
            : store.signal,
          seenSignals: hasScopedProjection
            ? readProjectedFlagsState().seenSignals
            : store.seenSignals,
          impulseQ: hasScopedProjection
            ? readProjectedImpulseQ()
            : store.impulseQ,
          backfillQ: toBackfillQSnapshot(store.backfillQ),
          registeredQ: expressionRegistry.registeredQ,
        };
        break;
    }

    if (as === "reference") {
      return readonlyReference(selected);
    }

    return snapshot(selected);
  });
}
