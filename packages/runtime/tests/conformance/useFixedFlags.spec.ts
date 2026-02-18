import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

describe("conformance/useFixedFlags", () => {
  it("freezes i.flags to reference flags for the impulse", () => {
    const run = createRuntime();
    const seen: Array<{
      flags: readonly string[];
      liveFlags: readonly string[];
    }> = [];

    run.set({ flags: createFlagsView(["a"]) });
    run.add({
      id: "expr:freeze",
      targets: [
        (i, _a, runtimeCore) => {
          seen.push({
            flags: i.flags.list,
            liveFlags: (runtimeCore.get("flags") as { list: string[] }).list,
          });
        },
      ],
    });

    run.impulse({ addFlags: ["b"] });

    expect(seen[0]?.flags).toEqual(["a"]);
    expect(seen[0]?.liveFlags).toEqual(["a", "b"]);
  });

  it("uses explicit useFixedFlags when provided", () => {
    const run = createRuntime();
    const seenFlags: Array<readonly string[]> = [];

    run.set({ flags: createFlagsView(["a"]) });
    run.add({
      id: "expr:fixed",
      targets: [
        (i) => {
          seenFlags.push(i.flags.list);
        },
      ],
    });

    run.impulse({
      addFlags: ["b"],
      useFixedFlags: createFlagsView(["x"]),
    });

    expect(seenFlags[0]).toEqual(["x"]);
  });
});
