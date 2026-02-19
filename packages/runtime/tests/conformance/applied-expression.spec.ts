import { describe, expect, it } from "vitest";
import { createRuntime } from "../../src/index.js";
import { createFlagsView } from "../../src/state/flagsView.js";

describe("conformance/applied-expression", () => {
  it("remove() removes expression deterministically and prevents future occurrences", () => {
    const run = createRuntime();
    const expressionId = "expr:applied-remove";
    let calls = 0;

    run.add({
      id: expressionId,
      targets: [
        (_i, a) => {
          calls += 1;
          a.remove();
        },
      ],
    });

    run.impulse({ addFlags: ["tick:1"] });
    run.impulse({ addFlags: ["tick:2"] });

    expect(calls).toBe(1);

    const registeredById = run.get("registeredById") as Map<string, unknown>;
    expect(registeredById.has(expressionId)).toBe(false);
  });

  it("matchFlags(input) always matches against runtime flags, not actExpression.flags", () => {
    const run = createRuntime();
    const matchResults: boolean[] = [];

    run.add({
      id: "expr:applied-match-flags",
      targets: [
        (_i, a) => {
          matchResults.push(a.matchFlags("flag:truth"));
          matchResults.push(a.matchFlags({ "flag:fixed": true }));
        },
      ],
    });

    run.impulse({
      useFixedFlags: createFlagsView(["flag:fixed"]),
      addFlags: ["flag:truth"],
    });

    run.impulse({
      useFixedFlags: createFlagsView([]),
      addFlags: ["flag:other"],
    });

    expect(matchResults).toEqual([true, false, true, false]);
  });
});
