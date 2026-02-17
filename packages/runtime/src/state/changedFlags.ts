/**
 * @file packages/runtime/src/state/changedFlags.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

import { createFlagsView, type Flag, type FlagsView } from "./flagsView.js";
import { hasOwn } from "../util/hasOwn.js";

/**
 * Compute changed flags between prev/next, removeFlags/addFlags.
 */
export function computeChangedFlags(
  prevTruth: FlagsView,
  nextTruth: FlagsView,
  removeFlags: readonly Flag[],
  addFlags: readonly Flag[],
): FlagsView {
  const membership = new Set<Flag>();

  for (const flag of prevTruth.list) {
    if (!hasOwn(nextTruth.map, flag)) {
      membership.add(flag);
    }
  }

  for (const flag of nextTruth.list) {
    if (!hasOwn(prevTruth.map, flag)) {
      membership.add(flag);
    }
  }

  const removed = new Set<Flag>();
  const conflicted = new Set<Flag>();
  const orderSeq: Flag[] = [];

  for (const flag of removeFlags) {
    if (hasOwn(prevTruth.map, flag)) {
      removed.add(flag);
      conflicted.add(flag);
      orderSeq.push(flag);
    }
  }

  for (const flag of addFlags) {
    if (conflicted.has(flag)) {
      continue;
    }

    if (removed.has(flag)) {
      continue;
    }

    if (!hasOwn(prevTruth.map, flag)) {
      orderSeq.push(flag);
    }
  }

  const orderedChanged = orderSeq.filter((flag) => membership.has(flag));

  return createFlagsView(orderedChanged);
}
