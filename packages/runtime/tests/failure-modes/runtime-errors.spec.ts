/**
 * @file packages/runtime/tests/failure-modes/runtime-errors.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Failure-mode coverage for runtime onError and diagnostic paths.
 */

import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";

describe("failure-modes/runtime-errors", () => {
  it("reports target phase via diagnostics when dispatch fails (Spec §8.1, §8.2)", () => {
    const run = createRuntime();
    const phases: string[] = [];

    run.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "dispatch.error") {
        phases.push(String(diagnostic.data?.phase));
      }
    });

    run.add({
      id: "expr:target-phase",
      targets: [
        () => {
          throw new Error("target boom");
        },
      ],
    });

    run.impulse({ addFlags: ["a"] });

    // Spec §8.2: target execution errors are routed through onError reporting flow.
    expect(phases).toContain("target/callback");
  });

  it("routes listener exceptions to impulseQ onError callback (Spec §8.1, §8.2)", () => {
    const run = createRuntime();
    const seen: unknown[] = [];

    run.set({
      impulseQ: {
        config: {
          onError: (error: unknown) => {
            seen.push(error);
          },
        },
      },
    });

    run.onDiagnostic((diagnostic) => {
      if (diagnostic.code === "dispatch.error") {
        throw new Error("listener boom");
      }
    });

    run.add({
      id: "expr:listener-phase",
      targets: [
        () => {
          throw new Error("target boom");
        },
      ],
    });

    run.impulse({ addFlags: ["a"] });

    // Spec §8.2: listener-side failures inside impulse processing are handled by configured onError.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Error);
    expect((seen[0] as Error).message).toBe("listener boom");
  });

  it("propagates trim callback errors directly during run.set (Spec §4.2, §8.2)", () => {
    const run = createRuntime();

    run.impulse({ addFlags: ["a"] });

    // Spec §4.2: trim can be triggered during set; thrown errors must stay observable to caller.
    expect(() =>
      run.set({
        impulseQ: {
          config: {
            maxBytes: 0,
            onTrim: () => {
              throw new Error("trim boom");
            },
          },
        },
      }),
    ).toThrow("trim boom");
  });
});
