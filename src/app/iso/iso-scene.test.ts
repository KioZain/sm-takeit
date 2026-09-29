import { describe, expect, it } from "vitest";

import { getLeavingItems } from "./iso-scene";
import type { IsoSceneItem } from "./iso-geometry";
import { at, record } from "./iso-test-fixtures";

function item(objectId: string, col: number, row: number): IsoSceneItem {
  return {
    diamond: [],
    elevation: 0,
    imageRect: { height: 10, width: 10, x: 0, y: 0 },
    placement: at(objectId, col, row),
    record: record(objectId),
  };
}

describe("iso scene pieces", () => {
  it("keeps the pieces that left so they can play their way out", () => {
    const before = [item("maki", 0, 0), item("maki", 1, 1), item("nigiri", 2, 2)];
    const after = [before[1]!, before[2]!];

    expect(getLeavingItems(before, after).map((left) => left.placement.id)).toEqual([
      "maki@0,0",
    ]);
  });

  it("finds nothing to play out while the field only redraws", () => {
    const before = [item("maki", 0, 0), item("nigiri", 1, 1)];
    // A running wave rebuilds the items every frame under the same ids.
    const redrawn = before.map((left) => ({ ...left, elevation: 12 }));

    expect(getLeavingItems(before, redrawn)).toEqual([]);
    expect(getLeavingItems(before, [...before, item("maki", 3, 3)])).toEqual([]);
  });

  it("lets a replaced piece go without playing it out", () => {
    const before = [item("maki", 0, 0), item("nigiri", 1, 1)];
    // Another piece took the same cell in the same move: the arrival is the
    // animation, so the piece it stands on never plays its way out.
    const swapped = [{ ...item("nigiri", 0, 0) }, before[1]!];
    expect(getLeavingItems(before, swapped)).toEqual([]);

    // The same roll put back carries a fresh id, and still does not fade out.
    const again = [
      { ...before[0]!, placement: { ...before[0]!.placement, id: "maki@0,0~1" } },
      before[1]!,
    ];
    expect(getLeavingItems(before, again)).toEqual([]);

    // Erasing one of the two leaves its cells empty, so that one does play out.
    expect(getLeavingItems(before, [before[1]!]).map((left) => left.placement.id)).toEqual([
      "maki@0,0",
    ]);
  });

  it("plays out a handful of erased pieces", () => {
    const before = [item("maki", 0, 0), item("nigiri", 1, 1)];

    expect(getLeavingItems(before, [])).toHaveLength(2);
    expect(getLeavingItems([], [])).toEqual([]);
  });

  it("cuts to a board that changed wholesale instead of playing it out", () => {
    // A preset, a cleared field or a resized grid replaces the set at once;
    // playing out a dozen pieces would leave the old ones smeared over the new.
    const before = Array.from({ length: 9 }, (_, index) => item("maki", index, 0));

    expect(getLeavingItems(before, [])).toEqual([]);
    expect(getLeavingItems(before, before.slice(0, 5))).toHaveLength(4);
    expect(getLeavingItems(before, before.slice(0, 4))).toEqual([]);
  });
});
