import type { ImpulseQEntryCanonical } from "../../canon/impulseEntry.js";
import { trim } from "../../processing/trim.js";
import {
  createBackfillQ,
  type BackfillQSnapshot,
} from "../../state/backfillQ.js";
import {
  setDefaults,
  type Defaults,
  type SetDefaults,
} from "../../state/defaults.js";
import { createFlagsView, type FlagsView } from "../../state/flagsView.js";
import type { SeenSignals } from "../../state/signals.js";
import { hasOwn, isObject, measureEntryBytes } from "../util.js";
import type { RuntimeOnError, RuntimeStore } from "../store.js";
import type { RegistryStore } from "../../state/registry.js";
import { applyRuntimeOnError } from "../onError.js";
import type { DiagnosticCollector } from "../../diagnostics/index.js";

const hydrationRequiredKeys = [
  "onError",
  "defaults",
  "flags",
  "changedFlags",
  "seenFlags",
  "signal",
  "seenSignals",
  "impulseQ",
  "backfillQ",
  "registeredQ",
] as const;

const allowedPatchKeys = [
  "flags",
  "addFlags",
  "removeFlags",
  "defaults",
  "onError",
  "impulseQ",
] as const;

type RegisteredExpression = { id: string; tombstone?: true } & Record<
  string,
  unknown
>;

export function runSet(
  store: RuntimeStore,
  {
    expressionRegistry,
    diagnostics,
  }: {
    expressionRegistry: RegistryStore<RegisteredExpression>;
    diagnostics: DiagnosticCollector;
  },
  patch: Record<string, unknown>,
): void {
  store.withRuntimeStack(() => {
    if (!isObject(patch)) {
      throw new Error("set.patch.invalid");
    }

    const isHydration = hasOwn(patch, "backfillQ");

    if (isHydration) {
      for (const key of hydrationRequiredKeys) {
        if (!hasOwn(patch, key)) {
          throw new Error("set.hydration.incomplete");
        }
      }

      const hydration = patch as {
        onError?: RuntimeOnError;
        defaults: Defaults;
        flags: FlagsView;
        changedFlags?: FlagsView;
        seenFlags: FlagsView;
        signal?: string;
        seenSignals: SeenSignals;
        impulseQ: {
          q: { entries: ImpulseQEntryCanonical[]; cursor: number };
          config: {
            retain?: number | boolean;
            maxBytes?: number;
            onTrim?: (info: {
              entries: readonly ImpulseQEntryCanonical[];
              stats: { reason: "retain" | "maxBytes"; bytesFreed?: number };
            }) => void;
            onError?: RuntimeOnError;
          };
        };
        backfillQ: BackfillQSnapshot;
      };

      store.onError = hydration.onError ?? "report";
      store.defaults = hydration.defaults;
      store.flagsTruth = hydration.flags;
      store.changedFlags = hydration.changedFlags;
      store.seenFlags = hydration.seenFlags;
      store.signal = hydration.signal;
      store.seenSignals = hydration.seenSignals;

      store.impulseQ.q.entries = hydration.impulseQ.q.entries;
      store.impulseQ.q.cursor = hydration.impulseQ.q.cursor;

      if (hasOwn(hydration.impulseQ.config, "retain")) {
        store.impulseQ.config.retain = hydration.impulseQ.config.retain ?? 0;
      } else {
        store.impulseQ.config.retain = 0;
      }

      if (hasOwn(hydration.impulseQ.config, "maxBytes")) {
        store.impulseQ.config.maxBytes = Number(
          hydration.impulseQ.config.maxBytes,
        );
      } else {
        store.impulseQ.config.maxBytes = Number.POSITIVE_INFINITY;
      }

      store.impulseQ.config.onTrim = hydration.impulseQ.config.onTrim;
      store.impulseQ.config.onError = hydration.impulseQ.config.onError;

      store.backfillQ = createBackfillQ();
      for (const id of hydration.backfillQ.list) {
        const expression = expressionRegistry.resolve(id);
        if (expression) {
          store.backfillQ.list.push(expression);
          store.backfillQ.map[id] = true;
        }
      }

      return;
    }

    for (const key of Object.keys(patch)) {
      if (!(allowedPatchKeys as readonly string[]).includes(key)) {
        throw new Error("set.patch.forbidden");
      }
    }

    if (
      hasOwn(patch, "changedFlags") ||
      hasOwn(patch, "seenFlags") ||
      hasOwn(patch, "signal") ||
      hasOwn(patch, "seenSignals") ||
      hasOwn(patch, "backfillQ") ||
      hasOwn(patch, "registeredQ")
    ) {
      throw new Error("set.patch.forbidden");
    }

    if (
      hasOwn(patch, "flags") &&
      (hasOwn(patch, "addFlags") || hasOwn(patch, "removeFlags"))
    ) {
      throw new Error("set.patch.flags.conflict");
    }

    if (hasOwn(patch, "flags")) {
      const incoming = patch.flags;
      if (
        !isObject(incoming) ||
        !Array.isArray(incoming.list) ||
        !isObject(incoming.map)
      ) {
        throw new Error("set.patch.flags.invalid");
      }
      store.flagsTruth = createFlagsView(incoming.list as string[]);
    }

    if (hasOwn(patch, "addFlags") || hasOwn(patch, "removeFlags")) {
      const addFlags = Array.isArray(patch.addFlags) ? patch.addFlags : [];
      const removeFlags = Array.isArray(patch.removeFlags)
        ? patch.removeFlags
        : [];

      const map = { ...store.flagsTruth.map };
      for (const flag of removeFlags) delete map[String(flag)];
      for (const flag of addFlags) map[String(flag)] = true;
      store.flagsTruth = createFlagsView(Object.keys(map));
      store.changedFlags = undefined;
      store.seenFlags = createFlagsView([
        ...store.seenFlags.list,
        ...store.flagsTruth.list,
      ]);
    }

    if (hasOwn(patch, "defaults")) {
      store.defaults = setDefaults(
        store.defaults,
        patch.defaults as SetDefaults,
      );
    }

    if (hasOwn(patch, "onError")) {
      store.onError = patch.onError as RuntimeOnError;
    }

    if (hasOwn(patch, "impulseQ")) {
      const impulsePatch = patch.impulseQ;
      if (!isObject(impulsePatch)) {
        throw new Error("set.patch.impulseQ.invalid");
      }

      if (hasOwn(impulsePatch, "q")) {
        throw new Error("set.patch.impulseQ.q.forbidden");
      }

      if (isObject(impulsePatch.config)) {
        if (hasOwn(impulsePatch.config, "retain")) {
          store.impulseQ.config.retain = impulsePatch.config.retain as
            | number
            | boolean;
        }
        if (hasOwn(impulsePatch.config, "maxBytes")) {
          store.impulseQ.config.maxBytes = Number(impulsePatch.config.maxBytes);
        }
        if (hasOwn(impulsePatch.config, "onTrim")) {
          store.impulseQ.config.onTrim = impulsePatch.config.onTrim as
            | ((info: {
                entries: readonly ImpulseQEntryCanonical[];
                stats: { reason: "retain" | "maxBytes"; bytesFreed?: number };
              }) => void)
            | undefined;
        }
        if (hasOwn(impulsePatch.config, "onError")) {
          store.impulseQ.config.onError = impulsePatch.config.onError as
            | RuntimeOnError
            | undefined;
        }

        const trimmed = trim<ImpulseQEntryCanonical>({
          entries: store.impulseQ.q.entries,
          cursor: store.impulseQ.q.cursor,
          retain: store.impulseQ.config.retain,
          maxBytes: store.impulseQ.config.maxBytes,
          runtimeStackActive: store.runtimeStackDepth > 0,
          trimPendingMaxBytes: store.trimPendingMaxBytes,
          measureBytes: measureEntryBytes,
          ...(store.impulseQ.config.onTrim !== undefined
            ? {
                onTrim: (info: {
                  entries: readonly ImpulseQEntryCanonical[];
                  stats: { reason: "retain" | "maxBytes"; bytesFreed?: number };
                }) => {
                  try {
                    store.impulseQ.config.onTrim?.(info);
                  } catch (error) {
                    applyRuntimeOnError(
                      store.impulseQ.config.onError,
                      {
                        error,
                        code: "trim.onTrim.error",
                        phase: "trim/onTrim",
                        message:
                          error instanceof Error
                            ? error.message
                            : "Trim callback failed.",
                        data: { reason: info.stats.reason },
                      },
                      () => {
                        diagnostics.emit({
                          code: "trim.onTrim.error",
                          message:
                            error instanceof Error
                              ? error.message
                              : "Trim callback failed.",
                          severity: "error",
                          data: {
                            phase: "trim/onTrim",
                            reason: info.stats.reason,
                          },
                        });
                      },
                    );
                  }
                },
              }
            : {}),
        });

        store.impulseQ.q.entries = [...trimmed.entries];
        store.impulseQ.q.cursor = trimmed.cursor;
        store.trimPendingMaxBytes = trimmed.trimPendingMaxBytes;
      }
    }
  });
}
