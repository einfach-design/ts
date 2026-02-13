/**
 * @file packages/runtime/src/state/signals.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Signal state helpers (seenSignals + scalar signal projection).
 */

export type Signal = string;

export type SeenSignals = Readonly<{
  list: readonly Signal[];
  map: Readonly<Record<Signal, true>>;
}>;

export type SignalsInput = Readonly<{
  previousSignal?: Signal;
  previousSeenSignals?: SeenSignals;
  signals?: readonly Signal[];
  seenSignals?: SeenSignals;
}>;

export type SignalsState = Readonly<{
  signal: Signal | undefined;
  seenSignals: SeenSignals;
}>;

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function cloneSeenSignals(input: SeenSignals | undefined): {
  list: Signal[];
  map: Record<Signal, true>;
} {
  if (input === undefined) {
    return {
      list: [],
      map: {},
    };
  }

  return {
    list: [...input.list],
    map: { ...input.map },
  };
}

/**
 * Scalar signal projection from a signal list.
 */
export function projectSignal(
  signalsList: readonly Signal[] | undefined,
): Signal | undefined {
  if (signalsList === undefined || signalsList.length === 0) {
    return undefined;
  }

  return signalsList[signalsList.length - 1];
}

/**
 * Monotonic seenSignals extension (stable-unique, first occurrence wins).
 */
export function extendSeenSignals(
  prevSeenSignals: SeenSignals | undefined,
  nextSignals: readonly Signal[] | undefined,
): SeenSignals {
  const seen = cloneSeenSignals(prevSeenSignals);

  if (nextSignals === undefined) {
    return seen;
  }

  for (const signal of nextSignals) {
    if (seen.map[signal] === true) {
      continue;
    }

    seen.map[signal] = true;
    seen.list.push(signal);
  }

  return seen;
}

/**
 * Signal patch helper for `signals` + `seenSignals` semantics.
 */
export function signals(input: SignalsInput = {}): SignalsState {
  const hasSignals = hasOwn(input, "signals");
  const hasSeenSignals = hasOwn(input, "seenSignals");

  const signal = hasSignals
    ? projectSignal(input.signals)
    : input.previousSignal;

  const seenSignals = hasSeenSignals
    ? cloneSeenSignals(input.seenSignals)
    : hasSignals
      ? extendSeenSignals(input.previousSeenSignals, input.signals)
      : cloneSeenSignals(input.previousSeenSignals);

  return {
    signal,
    seenSignals,
  };
}
