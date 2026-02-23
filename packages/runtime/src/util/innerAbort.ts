export const INNER_ABORT = Symbol("runtime.innerAbort");

export type InnerExpressionAbort = Readonly<{
  [INNER_ABORT]: true;
  error: unknown;
}>;

export const isInnerExpressionAbort = (
  value: unknown,
): value is InnerExpressionAbort =>
  typeof value === "object" &&
  value !== null &&
  (value as { [INNER_ABORT]?: unknown })[INNER_ABORT] === true;
