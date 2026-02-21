/**
 * @file packages/runtime/src/runtime/api/matchExpression.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Runtime wrapper for matchExpression with Spec §4.6 own-property semantics.
 */

import {
  matchExpression,
  type MatchExpressionInput,
} from "../../match/matchExpression.js";
import type { MatchExpressionOpts } from "../../index.types.js";
import type { RuntimeStore } from "../store.js";
import { toMatchFlagsView } from "../util.js";

export function runMatchExpression(
  store: RuntimeStore,
  deps: { runMatchExpression?: typeof matchExpression },
  input: MatchExpressionOpts,
): boolean {
  return store.withRuntimeStack(() => {
    const runtimeReference: NonNullable<MatchExpressionInput["reference"]> = {};

    if (store.signal !== undefined) runtimeReference.signal = store.signal;
    const flags = toMatchFlagsView(store.flagsTruth);
    if (flags) runtimeReference.flags = flags;
    const changed = toMatchFlagsView(store.changedFlags);
    if (changed) runtimeReference.changedFlags = changed;

    const mergedDefaults = input.defaults ?? store.defaults;

    // Spec §4.6 (own-property semantics): do NOT spread-merge.
    // Provide runtime-derived values via fallbackReference.
    const engine = deps.runMatchExpression ?? matchExpression;

    return engine({
      ...(input as Omit<MatchExpressionInput, "defaults" | "reference">),
      defaults: mergedDefaults,
      reference:
        (input.reference as MatchExpressionInput["reference"]) ??
        runtimeReference,
      fallbackReference: runtimeReference,
    });
  });
}
