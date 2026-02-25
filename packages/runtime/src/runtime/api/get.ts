import { toBackfillQSnapshot } from "../../state/backfillQ.js";
import { computeChangedFlags } from "../../state/changedFlags.js";
import {
  applyFlagDeltas,
  createFlagsView,
  extendSeenFlags,
  type FlagsView,
} from "../../state/flagsView.js";
import { extendSeenSignals, projectSignal } from "../../state/signals.js";
import type { ImpulseQEntryCanonical } from "../../canon/impulseEntry.js";
import {
  classifyValueKind,
  readonlyOpaque,
  readonlyView,
  snapshot,
} from "../util.js";
import type { RuntimeStore } from "../store.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";
import type { RegistryStore } from "../../state/registry.js";
import type { RegisteredExpression } from "../../runs/coreRun.js";
import { createNullProtoRecord } from "../../util/nullProto.js";

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
    const nextFlags = applyFlagDeltas(flags, entry.addFlags, entry.removeFlags);

    changedFlags = computeChangedFlags(
      flags,
      nextFlags,
      entry.removeFlags,
      entry.addFlags,
    );
    flags = nextFlags;
    seenFlags = extendSeenFlags(seenFlags, flags.list);

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

const toCanonicalImpulseQConfig = (
  config: RuntimeStore["impulseQ"]["config"],
): RuntimeStore["impulseQ"]["config"] => {
  const retain =
    config.retain === true
      ? Number.POSITIVE_INFINITY
      : config.retain === false || config.retain === undefined
        ? 0
        : typeof config.retain === "number"
          ? config.retain === Number.POSITIVE_INFINITY
            ? Number.POSITIVE_INFINITY
            : Number.isFinite(config.retain)
              ? Math.max(0, Math.floor(config.retain))
              : 0
          : 0;

  const maxBytes =
    config.maxBytes === undefined
      ? Number.POSITIVE_INFINITY
      : typeof config.maxBytes === "number"
        ? config.maxBytes === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : Number.isFinite(config.maxBytes)
            ? Math.max(0, Math.floor(config.maxBytes))
            : Number.POSITIVE_INFINITY
        : Number.POSITIVE_INFINITY;

  return {
    ...config,
    retain,
    maxBytes,
  };
};

const projectImpulseQ = (
  impulseQ: RuntimeStore["impulseQ"],
  scope: Scope,
): RuntimeStore["impulseQ"] => {
  if (scope === "pending") {
    return {
      config: toCanonicalImpulseQConfig(impulseQ.config),
      q: impulseQ.q,
    };
  }

  if (scope === "applied") {
    return {
      config: toCanonicalImpulseQConfig(impulseQ.config),
      q: {
        cursor: impulseQ.q.cursor,
        entries: impulseQ.q.entries.slice(0, impulseQ.q.cursor),
      },
    };
  }

  return {
    config: toCanonicalImpulseQConfig(impulseQ.config),
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
      seenSignals: { list: [], map: createNullProtoRecord<true>() },
    };
  }

  return store.scopeProjectionBaseline;
};

const wantsFlagsProjectionForKey = (resolvedKey: string): boolean =>
  resolvedKey === "flags" ||
  resolvedKey === "changedFlags" ||
  resolvedKey === "seenFlags" ||
  resolvedKey === "signal" ||
  resolvedKey === "seenSignals";

const wantsImpulseProjectionForKey = (resolvedKey: string): boolean =>
  resolvedKey === "impulseQ";

const diagnosticsReferenceCache = new WeakMap<DiagnosticCollector, unknown[]>();

const getDiagnosticsReference = (
  diagnostics: DiagnosticCollector,
): unknown[] => {
  const latest = diagnostics.list() as unknown[];
  const cached = diagnosticsReferenceCache.get(diagnostics);

  if (cached === undefined) {
    diagnosticsReferenceCache.set(diagnostics, latest);
    return latest;
  }

  // Grow: append delta
  if (latest.length > cached.length) {
    cached.push(...latest.slice(cached.length));
    return cached;
  }

  // Shrink OR rebuild (clear + re-emit)
  if (latest.length !== cached.length) {
    cached.length = 0;
    cached.push(...latest);
    return cached;
  }

  // Same length but different objects (rebuild)
  for (let i = 0; i < latest.length; i++) {
    if (cached[i] !== latest[i]) {
      cached.length = 0;
      cached.push(...latest);
      break;
    }
  }

  return cached;
};

export function runGet(
  store: RuntimeStore,
  {
    expressionRegistry,
    diagnostics,
    allowUnsafeAlias,
    isDevMode,
  }: {
    expressionRegistry: RegistryStore<RegisteredExpression>;
    diagnostics: DiagnosticCollector;
    allowUnsafeAlias: boolean;
    isDevMode: boolean;
  },
  key?: string,
  opts?: { as?: "snapshot" | "reference" | "unsafeAlias"; scope?: string },
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
    const wantsScopeProjection = opts?.scope !== undefined;
    const wantsFlagsProjection =
      wantsScopeProjection && wantsFlagsProjectionForKey(resolvedKey);
    const wantsImpulseProjection =
      wantsScopeProjection && wantsImpulseProjectionForKey(resolvedKey);

    let projectionsComputed = false;

    let selectedFlags: FlagsView;
    let selectedChangedFlags: FlagsView | undefined;
    let selectedSeenFlags: FlagsView;
    let selectedSignal: string | undefined;
    let selectedSeenSignals: RuntimeStore["seenSignals"];
    let selectedImpulseQ: RuntimeStore["impulseQ"];

    // NOTE: keep projections lazy to avoid hot-path overhead for non-projection keys.
    const ensureProjections = (): void => {
      if (projectionsComputed) {
        return;
      }

      projectionsComputed = true;

      selectedFlags = store.flagsTruth;
      selectedChangedFlags = store.changedFlags;
      selectedSeenFlags = store.seenFlags;
      selectedSignal = store.signal;
      selectedSeenSignals = store.seenSignals;
      selectedImpulseQ = projectImpulseQ(store.impulseQ, "pending");

      if (wantsScopeProjection && wantsImpulseProjection) {
        const scope = resolveScope(opts?.scope);
        const projectedImpulseQ = projectImpulseQ(store.impulseQ, scope);
        selectedImpulseQ = projectedImpulseQ;

        if (wantsFlagsProjection) {
          const projectionSeed = getProjectionSeed(store, scope);
          const projectedFlagsState = projectFlagsState(
            projectedImpulseQ.q.entries,
            projectionSeed,
          );

          selectedFlags = projectedFlagsState.flags;
          selectedChangedFlags = projectedFlagsState.changedFlags;
          selectedSeenFlags = projectedFlagsState.seenFlags;
          selectedSignal = projectedFlagsState.signal;
          selectedSeenSignals = projectedFlagsState.seenSignals;
        }
      } else if (wantsScopeProjection && wantsFlagsProjection) {
        const scope = resolveScope(opts?.scope);
        const projectedImpulseQ = projectImpulseQ(store.impulseQ, scope);
        const projectionSeed = getProjectionSeed(store, scope);
        const projectedFlagsState = projectFlagsState(
          projectedImpulseQ.q.entries,
          projectionSeed,
        );

        selectedFlags = projectedFlagsState.flags;
        selectedChangedFlags = projectedFlagsState.changedFlags;
        selectedSeenFlags = projectedFlagsState.seenFlags;
        selectedSignal = projectedFlagsState.signal;
        selectedSeenSignals = projectedFlagsState.seenSignals;
      }
    };

    // NOTE: keep derived values lazy (esp. backfillQ snapshot) to avoid hot-path overhead.
    const getSelectedValue = (rk: AllowedGetKey): unknown => {
      switch (rk) {
        case "defaults":
          return store.defaults;
        case "flags":
          ensureProjections();
          return selectedFlags;
        case "changedFlags":
          ensureProjections();
          return selectedChangedFlags;
        case "seenFlags":
          ensureProjections();
          return selectedSeenFlags;
        case "signal":
          ensureProjections();
          return selectedSignal;
        case "seenSignals":
          ensureProjections();
          return selectedSeenSignals;
        case "scopeProjectionBaseline":
          return store.scopeProjectionBaseline;
        case "impulseQ":
          ensureProjections();
          return selectedImpulseQ;
        case "backfillQ":
          return toBackfillQSnapshot(store.backfillQ);
        case "registeredQ":
          return expressionRegistry.registeredQ;
        case "registeredById":
          return expressionRegistry.registeredById;
        case "diagnostics":
          return getDiagnosticsReference(diagnostics);
        case "*":
          ensureProjections();
          return {
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
            diagnostics: getDiagnosticsReference(diagnostics),
          };
      }
    };

    const selected = getSelectedValue(
      key !== undefined ? (resolvedKey as AllowedGetKey) : "*",
    );

    if (as === "unsafeAlias") {
      if (isDevMode && allowUnsafeAlias !== true) {
        diagnostics.emit({
          code: "get.as.unsafeAlias.forbidden",
          message:
            "unsafeAlias is forbidden in dev mode unless explicitly enabled.",
          severity: "error",
          data: {
            ...(key !== undefined ? { key: resolvedKey } : {}),
            ...(opts?.scope !== undefined ? { scope: opts.scope } : {}),
          },
        });
        throw new Error("get.as.unsafeAlias.forbidden");
      }

      diagnostics.emit({
        code: "runtime.get.unsafeAlias.used",
        message: "unsafeAlias returned a direct internal alias.",
        severity: "info",
        data: {
          ...(key !== undefined ? { key: resolvedKey } : {}),
          ...(opts?.scope !== undefined ? { scope: opts.scope } : {}),
        },
      });

      return selected;
    }

    if (as === "reference") {
      const valueKind = classifyValueKind(selected);
      if (valueKind === "Null" || valueKind === "Primitive") {
        return selected;
      }

      if (valueKind === "Array" || valueKind === "PlainObject") {
        return readonlyView(selected as object);
      }

      const copy = snapshot(selected);
      diagnostics.emit({
        code: "runtime.get.reference.fallbackSnapshot",
        message:
          "reference request used snapshot fallback for an opaque value kind.",
        severity: "info",
        data: {
          ...(key !== undefined ? { key: resolvedKey } : {}),
          ...(opts?.scope !== undefined ? { scope: opts.scope } : {}),
          valueKind,
        },
      });

      if (typeof copy === "object" && copy !== null) {
        return readonlyOpaque(copy);
      }

      return copy;
    }

    return snapshot(selected);
  });
}
