import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

type StructuredCloneGlobal = typeof globalThis & {
  structuredClone?: (value: unknown) => unknown;
};

type RuntimeDefaultsSnapshot = {
  methods: { on: { runs: { max: number } } };
};

describe("unit/structuredClone-fallback", () => {
  it("falls back to snapshot when structuredClone is missing (no throw, no ref leak)", () => {
    const runtimeGlobal = globalThis as StructuredCloneGlobal;
    const original = runtimeGlobal.structuredClone;

    try {
      delete runtimeGlobal.structuredClone;

      const run = createRuntime();
      const gate = { signal: { value: true, force: true } };

      expect(() =>
        run.when({
          id: "x",
          signal: "s",
          gate,
          targets: [() => undefined],
        } as never),
      ).not.toThrow();

      const snap = run.get("*", { as: "snapshot" }) as unknown as Record<
        string,
        unknown
      >;
      const defaults = snap.defaults as Record<string, unknown>;
      const methods = (defaults.methods as Record<string, unknown>) ?? {};
      defaults.methods = methods;
      methods.on = { runs: { max: 2 } };
      const methodsOn = methods.on as { runs: { max: number } };

      const rehydrated = createRuntime();
      expect(() => rehydrated.set(snap)).not.toThrow();

      methodsOn.runs.max = 999;

      const d2 = rehydrated.get("defaults", {
        as: "snapshot",
      }) as unknown as RuntimeDefaultsSnapshot;
      expect(d2.methods.on.runs.max).toBe(2);
    } finally {
      runtimeGlobal.structuredClone = original;
    }
  });
});
