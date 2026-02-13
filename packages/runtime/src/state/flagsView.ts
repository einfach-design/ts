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
