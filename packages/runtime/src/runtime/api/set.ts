import type { ImpulseQEntryCanonical } from "../../canon/impulseEntry.js";
import { trim } from "../../processing/trim.js";
import { createBackfillQ, type BackfillQSnapshot } from "../../state/backfillQ.js";
import { computeChangedFlags } from "../../state/changedFlags.js";
import {
  setDefaults,
  type Defaults,
  type SetDefaults,
} from "../../state/defaults.js";
import { createFlagsView, type FlagsView } from "../../state/flagsView.js";
import type { SeenSignals } from "../../state/signals.js";
import { hasOwn, isObject, measureEntryBytes } from "../util.js";
import type { RuntimeStore } from "../store.js";
import type { RegistryStore } from "../../state/registry.js";


const allowedSetKeys = [
  "flags",
  "addFlags",
  "removeFlags",
  "defaults",
] as const;

type RegisteredExpression = { id: string; tombstone?: true } & Record<string, unknown>;


export function runSet(
  store: RuntimeStore,
  { expressionRegistry }: { expressionRegistry: RegistryStore<RegisteredExpression> },
  patch: Record<string, unknown>,
): void {
      store.withRuntimeStack(() => {
        if (!isObject(patch)) {
          throw new Error("set.patch.invalid");
        }

        const isHydration = hasOwn(patch, "store.backfillQ");

        if (isHydration) {
          const hydration = patch as {
            defaults?: Defaults;
            flags?: FlagsView;
            changedFlags?: FlagsView;
            seenFlags?: FlagsView;
            signal?: string;
            seenSignals?: SeenSignals;
            impulseQ?: {
              q?: { entries?: ImpulseQEntryCanonical[]; cursor?: number };
              config?: { retain?: number | boolean; maxBytes?: number };
            };
            backfillQ?: BackfillQSnapshot;
          };

          if (hydration.defaults) store.defaults = hydration.defaults;
          if (hydration.flags) store.flagsTruth = hydration.flags;
          if (hasOwn(hydration, "store.changedFlags"))
            store.changedFlags = hydration.changedFlags;
          if (hydration.seenFlags) store.seenFlags = hydration.seenFlags;
          if (hasOwn(hydration, "store.signal")) store.signal = hydration.signal;
          if (hydration.seenSignals) store.seenSignals = hydration.seenSignals;
          if (hydration.impulseQ?.q?.entries)
            store.impulseQ.q.entries = hydration.impulseQ.q.entries;
          if (typeof hydration.impulseQ?.q?.cursor === "number")
            store.impulseQ.q.cursor = hydration.impulseQ.q.cursor;
          if (hasOwn(hydration.impulseQ?.config ?? {}, "retain"))
            store.impulseQ.config.retain = hydration.impulseQ?.config?.retain ?? 0;
          if (typeof hydration.impulseQ?.config?.maxBytes === "number")
            store.impulseQ.config.maxBytes = hydration.impulseQ.config.maxBytes;

          if (hydration.backfillQ) {
            store.backfillQ = createBackfillQ();
            for (const id of hydration.backfillQ.list) {
              const expression = expressionRegistry.resolve(id);
              if (expression) {
                store.backfillQ.list.push(expression);
                store.backfillQ.map[id] = true;
              }
            }
          }

          return;
        }

        for (const k of Object.keys(patch)) {
          if (!(allowedSetKeys as readonly string[]).includes(k)) {
            throw new Error("set.patch.forbidden");
          }
        }

        if (hasOwn(patch, "impulseQ") || hasOwn(patch, "backfillQ")) {
          throw new Error("set.patch.forbidden");
        }

        if (

          hasOwn(patch, "store.changedFlags") ||
          hasOwn(patch, "store.seenFlags") ||
          hasOwn(patch, "store.signal") ||
          hasOwn(patch, "store.seenSignals")
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

          const before = store.flagsTruth;
          const map = { ...before.map };
          for (const flag of removeFlags) delete map[String(flag)];
          for (const flag of addFlags) map[String(flag)] = true;
          store.flagsTruth = createFlagsView(Object.keys(map));
          store.changedFlags = computeChangedFlags(
            before,
            store.flagsTruth,
            removeFlags as string[],
            addFlags as string[],
          );
          store.seenFlags = createFlagsView([...store.seenFlags.list, ...store.flagsTruth.list]);
        }

        if (hasOwn(patch, "defaults")) {
          store.defaults = setDefaults(store.defaults, patch.defaults as SetDefaults);
        }

        if (hasOwn(patch, "store.impulseQ")) {
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

            const trimmed = trim({
              entries: store.impulseQ.q.entries,
              cursor: store.impulseQ.q.cursor,
              retain: store.impulseQ.config.retain,
              maxBytes: store.impulseQ.config.maxBytes,
              runtimeStackActive: store.runtimeStackDepth > 0,
              trimPendingMaxBytes: store.trimPendingMaxBytes,
              measureBytes: measureEntryBytes,
            });

            store.impulseQ.q.entries = [...trimmed.entries];
            store.impulseQ.q.cursor = trimmed.cursor;
            store.trimPendingMaxBytes = trimmed.trimPendingMaxBytes;
          }
        }
      });
}