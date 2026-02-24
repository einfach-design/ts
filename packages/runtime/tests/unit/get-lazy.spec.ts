import { describe, expect, it, vi } from "vitest";

import { createRuntime } from "../../src/index.js";
import * as backfill from "../../src/state/backfillQ.js";
import * as changed from "../../src/state/changedFlags.js";
import * as signals from "../../src/state/signals.js";

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

  it("does not compute projections for diagnostics/registries/backfillQ", () => {
    const changedSpy = vi.spyOn(changed, "computeChangedFlags");
    const signalSpy = vi.spyOn(signals, "projectSignal");
    const run = createRuntime();

    run.set({ impulseQ: { config: { retain: true } } });
    run.impulse({ signals: ["s1"], addFlags: ["f1"] });
    changedSpy.mockClear();
    signalSpy.mockClear();

    run.get("diagnostics", { as: "snapshot", scope: "pending" });
    run.get("registeredById", { as: "snapshot", scope: "pending" });
    run.get("registeredQ", { as: "snapshot", scope: "pending" });
    run.get("backfillQ", { as: "snapshot", scope: "pending" });

    expect(changedSpy).toHaveBeenCalledTimes(0);
    expect(signalSpy).toHaveBeenCalledTimes(0);

    run.get("changedFlags", { as: "snapshot", scope: "pending" });

    expect(changedSpy).toHaveBeenCalled();
    expect(signalSpy).toHaveBeenCalled();
  });
});
