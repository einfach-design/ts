/**
 * @file packages/runtime/tests/unit/registry-backfill-q/state.spec.ts
 * @version 0.11.3
 * @maintainer Axel Elstermann | einfach.design (e2d)
 * @scope Runtime package test code.
 * @description Unit coverage for registry and backfillQ state helpers.
 */

import { describe, expect, it } from "vitest";

import {
  appendIfAbsent,
  assertBackfillQInvariant,
  createBackfillQ,
  toBackfillQSnapshot,
} from "../../../src/state/backfillQ.js";
import { registry } from "../../../src/state/registry.js";

describe("state/registry", () => {
  it("stores insert-order in registeredQ and id lookup in registeredById", () => {
    const reg = registry<{ id: string; tombstone?: true; signal?: string }>();
    reg.register({ id: "a", signal: "foo" });
    reg.register({ id: "b", signal: "bar" });

    expect(reg.registeredQ.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(reg.resolve("a")?.signal).toBe("foo");
    expect(reg.isRegistered("b")).toBe(true);
  });

  it("marks tombstones on remove while retaining historical queue entries", () => {
    const reg = registry<{ id: string; tombstone?: true }>();
    reg.register({ id: "a" });
    reg.register({ id: "b" });

    reg.remove("a");

    expect(reg.registeredQ.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(reg.resolve("a")?.tombstone).toBe(true);
    expect(reg.isRegistered("a")).toBe(false);
    expect(reg.activeList().map((entry) => entry.id)).toEqual(["b"]);
  });

  it("rejects duplicate ids", () => {
    const reg = registry<{ id: string; tombstone?: true }>();
    reg.register({ id: "x" });

    expect(() => reg.register({ id: "x" })).toThrow(
      "Duplicate registered expression id: x",
    );
  });
});

describe("state/backfillQ", () => {
  it("dedupes by id (not by reference identity)", () => {
    const queue = createBackfillQ<{ id: string; marker: string }>();

    appendIfAbsent(queue, { id: "x", marker: "first" });
    appendIfAbsent(queue, { id: "x", marker: "second" });
    appendIfAbsent(queue, { id: "y", marker: "third" });

    expect(queue.list.map((entry) => entry.marker)).toEqual(["first", "third"]);
    expect(queue.map).toEqual({ x: true, y: true });
  });

  it("projects an id-only snapshot", () => {
    const queue = createBackfillQ<{ id: string }>();
    appendIfAbsent(queue, { id: "a" });
    appendIfAbsent(queue, { id: "b" });

    expect(toBackfillQSnapshot(queue)).toEqual({
      list: ["a", "b"],
      map: { a: true, b: true },
    });
  });

  it("asserts list/map bijection invariants", () => {
    const queue = createBackfillQ<{ id: string }>();
    appendIfAbsent(queue, { id: "ok" });

    expect(() => assertBackfillQInvariant(queue)).not.toThrow();

    queue.list.push({ id: "ok" });
    expect(() => assertBackfillQInvariant(queue)).toThrow(
      "Invalid backfillQ invariant: duplicate ids in list.",
    );
  });
});
