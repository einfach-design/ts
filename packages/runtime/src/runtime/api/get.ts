import { toBackfillQSnapshot } from "../../state/backfillQ.js";
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

type RegisteredExpression = { id: string; tombstone?: true };

export function runGet(
  store: RuntimeStore,
  { expressionRegistry, diagnostics }: { expressionRegistry: RegistryStore<RegisteredExpression>; diagnostics: DiagnosticCollector },
  key?: string,
  opts?: { as?: "snapshot" | "reference"; scope?: string },
): unknown {
  const resolvedKey = (key ?? "*") as string;

  if (key !== undefined && !(allowedGetKeys as readonly string[]).includes(resolvedKey)) {
    throw new Error("get.key.invalid");
  }

  return store.withRuntimeStack(() => {
    const as = opts?.as ?? "snapshot";

    const valueByKey: Record<AllowedGetKey, unknown> = {
      defaults: store.defaults,
      flags: store.flagsTruth,
      changedFlags: store.changedFlags,
      seenFlags: store.seenFlags,
      signal: store.signal,
      seenSignals: store.seenSignals,
      impulseQ: store.impulseQ,
      backfillQ: toBackfillQSnapshot(store.backfillQ),
      registeredQ: expressionRegistry.registeredQ,
      diagnostics: diagnostics.list(),
      "*": {
        defaults: store.defaults,
        flags: store.flagsTruth,
        changedFlags: store.changedFlags,
        seenFlags: store.seenFlags,
        signal: store.signal,
        seenSignals: store.seenSignals,
        impulseQ: store.impulseQ,
        backfillQ: toBackfillQSnapshot(store.backfillQ),
        registeredQ: expressionRegistry.registeredQ,
      },
    };

    const selected = valueByKey[resolvedKey as AllowedGetKey] ?? valueByKey["*"];
    if (as === "reference") {
      return readonlyReference(selected);
    }

    return snapshot(selected);
  });
}