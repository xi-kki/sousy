/**
 * Sousy — Tool Execution Tests
 *
 * Tests the inventory mutation functions that the LLM agent calls.
 * All functions are pure (given input → predictable output), making
 * them straightforward to unit test.
 */

import { describe, it, expect } from "vitest";
import { applyToolCall } from "./tools.js";

/**
 * Create a fresh inventory fixture for each test.
 * Uses structuredClone to prevent test cross-contamination.
 */
function freshInventory() {
  return [
    { id: "s1", name: "salmon fillet", quantity: 6, unit: "each", category: "protein", expiresOn: "2026-07-10" },
    { id: "s2", name: "tomato", quantity: 2, unit: "crate", category: "produce", expiresOn: "2026-07-12" },
    { id: "s3", name: "spinach", quantity: 4, unit: "bag", category: "produce", expiresOn: "2026-07-09" },
    { id: "s4", name: "basmati rice", quantity: 20, unit: "kg", category: "dry", expiresOn: null },
  ];
}

// ── upsert_item ─────────────────────────────────────────────

describe("upsert_item", () => {
  it("adds a new item to inventory", () => {
    const inv = freshInventory();
    const result = applyToolCall(inv, "upsert_item", {
      name: "chicken breast",
      quantity: 3,
      unit: "kg",
      category: "protein",
    });

    expect(result).not.toBeNull();
    expect(result.kind).toBe("upsert");
    expect(inv).toHaveLength(5);
    expect(inv.find((i) => i.name === "chicken breast")?.quantity).toBe(3);
  });

  it("updates an existing item's quantity", () => {
    const inv = freshInventory();
    applyToolCall(inv, "upsert_item", {
      name: "salmon fillet",
      quantity: 10,
      unit: "each",
      category: "protein",
    });

    const item = inv.find((i) => i.name === "salmon fillet");
    expect(item?.quantity).toBe(10);
    expect(item?.unit).toBe("each");
    expect(inv).toHaveLength(4); // no new item added
  });

  it("preserves existing expiry when not provided", () => {
    const inv = freshInventory();
    applyToolCall(inv, "upsert_item", {
      name: "salmon fillet",
      quantity: 3,
      unit: "each",
      category: "protein",
    });

    const item = inv.find((i) => i.name === "salmon fillet");
    expect(item?.expiresOn).toBe("2026-07-10"); // unchanged
  });

  it("sets null expiry for new items when days_until_expiry omitted", () => {
    const inv = freshInventory();
    applyToolCall(inv, "upsert_item", {
      name: "salt",
      quantity: 1,
      unit: "bag",
      category: "dry",
    });

    const item = inv.find((i) => i.name === "salt");
    expect(item?.expiresOn).toBeNull();
  });
});

// ── consume_item ────────────────────────────────────────────

describe("consume_item", () => {
  it("reduces quantity and keeps item when above zero", () => {
    const inv = freshInventory();
    const result = applyToolCall(inv, "consume_item", { name: "salmon fillet", quantity: 2 });

    expect(result.kind).toBe("consume");
    expect(result.detail).toContain("4");
    const item = inv.find((i) => i.name === "salmon fillet");
    expect(item?.quantity).toBe(4);
    expect(inv).toHaveLength(4);
  });

  it("removes item when quantity hits zero", () => {
    const inv = freshInventory();
    applyToolCall(inv, "consume_item", { name: "tomato", quantity: 2 });

    expect(inv.find((i) => i.name === "tomato")).toBeUndefined();
    expect(inv).toHaveLength(3);
  });

  it("removes item when consumption exceeds stock", () => {
    const inv = freshInventory();
    applyToolCall(inv, "consume_item", { name: "spinach", quantity: 10 });

    expect(inv.find((i) => i.name === "spinach")).toBeUndefined();
    // quantity clamps to 0 then removes
  });

  it("handles missing item gracefully", () => {
    const inv = freshInventory();
    const result = applyToolCall(inv, "consume_item", { name: "nonexistent", quantity: 1 });

    expect(result.detail).toBe("not found");
    expect(inv).toHaveLength(4);
  });
});

// ── remove_item ─────────────────────────────────────────────

describe("remove_item", () => {
  it("removes an existing item", () => {
    const inv = freshInventory();
    applyToolCall(inv, "remove_item", { name: "spinach" });

    expect(inv.find((i) => i.name === "spinach")).toBeUndefined();
    expect(inv).toHaveLength(3);
  });

  it("handles missing item gracefully", () => {
    const inv = freshInventory();
    const result = applyToolCall(inv, "remove_item", { name: "ghost" });

    expect(result.detail).toBe("not found");
    expect(inv).toHaveLength(4);
  });
});

// ── Unknown tool ────────────────────────────────────────────

describe("unknown tool", () => {
  it("returns null for an unrecognised tool name", () => {
    const inv = freshInventory();
    const result = applyToolCall(inv, "fly_to_moon", {});

    expect(result).toBeNull();
    expect(inv).toHaveLength(4); // no mutation
  });
});
