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

  it("marks tombstones on remove and drops id lookup entry", () => {
    const reg = registry<{ id: string; tombstone?: true }>();
    reg.register({ id: "a" });
    reg.register({ id: "b" });

    reg.remove("a");

    expect(reg.registeredQ.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(reg.registeredQ[0]?.tombstone).toBe(true);
    expect(reg.resolve("a")).toBeUndefined();
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

  it("compacts deterministically after tombstone threshold is reached", () => {
    const reg = registry<{ id: string; tombstone?: true }>();

    for (let index = 1; index <= 16; index += 1) {
      reg.register({ id: `id-${index}` });
    }

    for (let index = 1; index <= 7; index += 1) {
      reg.remove(`id-${index}`);
    }

    expect(reg.registeredQ).toHaveLength(16);

    reg.remove("id-8");

    expect(reg.registeredQ).toHaveLength(8);
    expect(reg.registeredQ.map((entry) => entry.id)).toEqual([
      "id-9",
      "id-10",
      "id-11",
      "id-12",
      "id-13",
      "id-14",
      "id-15",
      "id-16",
    ]);
  });

  it("keeps registeredById correct across trigger compaction cycles", () => {
    const reg = registry<{ id: string; tombstone?: true; marker?: string }>();

    for (let index = 1; index <= 16; index += 1) {
      reg.register({ id: `id-${index}`, marker: `m-${index}` });
    }

    for (let index = 1; index <= 8; index += 1) {
      reg.remove(`id-${index}`);
    }

    expect(reg.registeredById.size).toBe(8);
    expect(reg.resolve("id-4")).toBeUndefined();
    expect(reg.resolve("id-12")?.marker).toBe("m-12");

    for (let index = 9; index <= 15; index += 1) {
      reg.remove(`id-${index}`);
    }

    expect(reg.registeredQ).toHaveLength(8);

    reg.remove("id-16");

    expect(reg.registeredQ).toHaveLength(0);
    expect(reg.registeredById.size).toBe(0);
    expect(reg.activeList()).toEqual([]);
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

  it("returns whether enqueue happened", () => {
    const queue = createBackfillQ<{ id: string }>();

    expect(appendIfAbsent(queue, { id: "a" })).toBe(true);
    expect(appendIfAbsent(queue, { id: "a" })).toBe(false);
  });

  it("does not enqueue tombstoned expressions", () => {
    const queue = createBackfillQ<{ id: string; tombstone?: true }>();

    expect(appendIfAbsent(queue, { id: "a", tombstone: true })).toBe(false);
    expect(queue.list).toEqual([]);
    expect(queue.map).toEqual({});
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
