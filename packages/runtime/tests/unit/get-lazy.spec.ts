import { describe, expect, it, vi } from "vitest";

import { createRuntime } from "../../src/index.js";
import * as backfill from "../../src/state/backfillQ.js";

describe("unit/get-lazy", () => {
  it("calls toBackfillQSnapshot only for backfillQ or *", () => {
    const spy = vi.spyOn(backfill, "toBackfillQSnapshot");
    const run = createRuntime();

    run.get("flags", { as: "snapshot" });
    run.get("diagnostics", { as: "snapshot" });
    expect(spy).toHaveBeenCalledTimes(0);

    run.get("backfillQ", { as: "snapshot" });
    expect(spy).toHaveBeenCalledTimes(1);

    run.get("*", { as: "snapshot" });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
