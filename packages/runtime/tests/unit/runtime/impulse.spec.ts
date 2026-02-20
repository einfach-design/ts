import { describe, expect, it } from "vitest";

import { createDiagnosticCollector } from "../../../src/diagnostics/index.js";
import { runImpulse } from "../../../src/runtime/api/impulse.js";
import { initRuntimeStore } from "../../../src/runtime/store.js";

describe("runtime/api/impulse", () => {
  it("does not start a nested drain during reentrant run.impulse calls", () => {
    const store = initRuntimeStore();
    const diagnostics = createDiagnosticCollector();
    const processed: string[] = [];

    runImpulse(
      store,
      {
        diagnostics,
        processImpulseEntry: (entry) => {
          const signal = entry.signals[0] ?? "none";
          processed.push(signal);

          if (signal === "root") {
            runImpulse(
              store,
              {
                diagnostics,
                processImpulseEntry: () => undefined,
              },
              { signals: ["nested"] },
            );
          }
        },
      },
      { signals: ["root"] },
    );

    expect(processed).toEqual(["root", "nested"]);
    expect(store.impulseQ.q.cursor).toBe(0);
    expect(store.impulseQ.q.entries).toEqual([]);
    expect(store.draining).toBe(false);
  });
});
