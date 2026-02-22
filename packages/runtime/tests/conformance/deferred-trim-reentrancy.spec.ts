import { describe, expect, it } from "vitest";

import { createRuntime } from "../../src/index.js";

describe("conformance/deferred-trim-reentrancy", () => {
  it("onTrim reentrancy can enqueue but must not drain", () => {
    const run = createRuntime();

    run.set({
      impulseQ: {
        config: {
          retain: 0,
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
    expect(q.q.entries).toHaveLength(1);
    expect(q.q.entries[0]?.addFlags).toContain("trimReenter");
  });

  it("deferred maxBytes trim reentrancy enqueues but must not drain", () => {
    const run = createRuntime();

    run.set({
      impulseQ: {
        config: {
          retain: true,
          maxBytes: 120,
          onTrim() {
            run.impulse({ addFlags: ["trimReenterDeferred"], signals: [] });
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
    expect(appliedFlags.list).not.toContain("trimReenterDeferred");
    expect(q.q.cursor).toBe(0);
    expect(q.q.entries).toHaveLength(1);
    expect(q.q.entries[0]?.addFlags).toContain("trimReenterDeferred");
  });

  it("onTrimError diagnostic reentrancy must not drain or corrupt queue", () => {
    const run = createRuntime();
    let didReenter = false;

    run.onDiagnostic((d) => {
      if (
        !didReenter &&
        d.code === "runtime.onError.report" &&
        (d.data as { phase?: string } | undefined)?.phase === "trim/onTrim"
      ) {
        didReenter = true;
        run.impulse({ addFlags: ["diagReenter"], signals: [] });
      }
    });

    run.set({
      impulseQ: {
        config: {
          retain: true,
          maxBytes: 120,
          onTrim() {
            throw new Error("boom");
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
    expect(appliedFlags.list).not.toContain("diagReenter");
    expect(q.q.cursor).toBe(0);
    expect(q.q.entries).toHaveLength(1);
    expect(q.q.entries[0]?.addFlags).toContain("diagReenter");
  });
});
