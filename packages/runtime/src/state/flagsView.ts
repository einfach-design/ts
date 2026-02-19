/**
 * @file packages/runtime/src/state/flagsView.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Project file.
 */

export type Flag = string;

export type FlagsView = {
  list: readonly Flag[];
  map: Readonly<Record<Flag, true>>;
};

/**
 * Create a stable-unique FlagsView (first occurrence wins).
 */
export function createFlagsView(input: readonly Flag[]): FlagsView {
  const list: Flag[] = [];
  const map: Record<Flag, true> = {};

  for (const flag of input) {
    if (Object.prototype.hasOwnProperty.call(map, flag)) {
      continue;
    }

    map[flag] = true;
    list.push(flag);
  }

  return {
    list,
    map,
  };
}

/**
 * Apply remove/add deltas deterministically using list order (not Object.keys(map)).
 */
export function applyFlagDeltas(
  previous: FlagsView,
  addFlags: readonly Flag[],
  removeFlags: readonly Flag[],
): FlagsView {
  const removeSet = new Set(removeFlags);
  const nextList: Flag[] = [];
  const nextMap: Record<Flag, true> = {};

  for (const flag of previous.list) {
    if (removeSet.has(flag)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(nextMap, flag)) {
      continue;
    }

    nextMap[flag] = true;
    nextList.push(flag);
  }

  for (const flag of addFlags) {
    if (removeSet.has(flag)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(nextMap, flag)) {
      continue;
    }

    nextMap[flag] = true;
    nextList.push(flag);
  }

  return createFlagsView(nextList);
}

export function extendSeenFlags(
  current: FlagsView,
  incoming: readonly Flag[],
): FlagsView {
  return createFlagsView([...current.list, ...incoming]);
}
