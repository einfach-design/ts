/**
 * Golden path integration (public API only)
 *
 * Keep tiny and deterministic.
 */
import { describe, it, expect } from "vitest";
import { createRuntime } from "../src/index.js";

type TargetImpulseArg = Readonly<{ flags?: unknown }>;
type TargetExpressionArg = Readonly<{ id?: unknown }>;
type TargetRuntimeArg = Readonly<{ get?: unknown }>;

type TargetCall = Readonly<{
  i: TargetImpulseArg;
  a: TargetExpressionArg;
  r: TargetRuntimeArg;
}>;

describe("runtime/golden-path", () => {
  it("impulse triggers a registered target exactly once with expected args shape", () => {
    const run = createRuntime();

    const calls: TargetCall[] = [];

    const expr = {
      id: "expr:golden",
      targets: [
        (i: unknown, a: unknown, r: unknown) => {
          calls.push({
            i: (i ?? {}) as TargetImpulseArg,
            a: (a ?? {}) as TargetExpressionArg,
            r: (r ?? {}) as TargetRuntimeArg,
          });
        },
      ],
    } as unknown as Record<string, unknown>;

    run.add(expr);

    run.impulse({ addFlags: ["go"] } as unknown as Record<string, unknown>);

    expect(calls.length).toBe(1);

    const call0 = calls[0];
    expect(call0?.a?.id).toBe("expr:golden");
    expect(call0?.i?.flags).toBeTruthy();
    expect(typeof call0?.r?.get).toBe("function");
  });
});
