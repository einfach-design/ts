/**
 * @file packages/runtime/src/util/nullProto.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package source code.
 * @description Null-prototype record helpers for safe map semantics.
 */

export function createNullProtoRecord<V = unknown>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}

export function cloneNullProtoRecord<V>(
  input: Readonly<Record<string, V>>,
): Record<string, V> {
  const out = createNullProtoRecord<V>();

  for (const key of Object.keys(input)) {
    out[key] = input[key]!;
  }

  return out;
}

export function setNullProtoTrue(out: Record<string, true>, key: string): void {
  out[key] = true;
}
