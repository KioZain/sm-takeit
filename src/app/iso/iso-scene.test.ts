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

  it("plays out every piece when the field is cleared", () => {
    const before = [item("maki", 0, 0), item("nigiri", 1, 1)];

    expect(getLeavingItems(before, [])).toHaveLength(2);
    expect(getLeavingItems([], [])).toEqual([]);
  });
});
