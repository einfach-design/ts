import { describe, expect, it } from "vitest";

import { createRuntime } from "../../src/index.js";

describe("conformance/deferred-trim-reentrancy", () => {
  it("onTrim reentrancy can enqueue but must not drain", () => {
    const run = createRuntime();

    run.set({
      impulseQ: {
        config: {
          maxBytes: 120,
          onTrim() {
            run.impulse({ addFlags: ["trimReenter"], signals: [] });
          },
        },
      },
    });

    run.impulse({ livePayload: "x".repeat(200) });

    const q = run.get("impulseQ", { as: "snapshot" }) as {
      q: { cursor: number; entries: Array<{ addFlags: string[] }> };
    };

    const appliedFlags = run.get("flags", {
      scope: "applied",
      as: "snapshot",
    }) as { list: string[] };
    expect(appliedFlags.list).not.toContain("trimReenter");
    expect(q.q.cursor).toBe(0);
    expect(q.q.entries).toHaveLength(0);
  });
});
