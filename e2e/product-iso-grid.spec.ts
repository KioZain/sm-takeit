import type { Locator, Page } from "@playwright/test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftSegmentedControlCellsPreservePadding } from "./performance-control-layout-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { ISO_PRODUCT_SVG, openIsoApp } from "./product-iso-test-support";
import { expect, test } from "./toolcraft-product-test";

function gridLines(page: Page): Locator {
  return page.locator(`${ISO_PRODUCT_SVG} [data-iso-layer="grid"] line`);
}

test("browser acceptance: grid preset rebuilds the field", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await expect(gridLines(page)).toHaveCount(14);

  await expectToolcraftSegmentedControlCellsPreservePadding(page, "Size", {
    requirementId: "grid.preset",
    target: "grid.preset",
  });
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.preset", async (control) => {
      await control.getByRole("button", { name: "12×12" }).click();
    }),
    { requirementId: "grid.preset", selector: ISO_PRODUCT_SVG },
  );
  await expect(gridLines(page)).toHaveCount(26);

  await page
    .locator('[data-toolcraft-control-target="grid.preset"]')
    .getByRole("button", { name: "6×6" })
    .click();
  await expect(gridLines(page)).toHaveCount(14);
});

test("browser acceptance: cell size resizes the field live", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  const svg = page.locator(ISO_PRODUCT_SVG);
  const widthBefore = Number(await svg.getAttribute("width"));

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.cellSize", async (control, currentPage) => {
      const input = control.locator('input[type="range"]');
      const min = Number(await input.getAttribute("min"));
      const max = Number(await input.getAttribute("max"));
      const value = Number(await input.inputValue());
      const track = control.locator('[data-slot="slider"]').first();
      const box = await track.boundingBox();
      if (!box) throw new Error("The Cell slider track has no layout box.");
      const startX = box.x + (box.width * (value - min)) / (max - min);
      const y = box.y + box.height / 2;
      await currentPage.mouse.move(startX, y);
      await currentPage.mouse.down();
      await currentPage.mouse.move(startX + box.width * 0.25, y, { steps: 8 });
    }),
    { requirementId: "grid.cellSize", selector: ISO_PRODUCT_SVG },
  );
  // The field is already resized while the pointer is still held.
  expect(Number(await svg.getAttribute("width"))).toBeGreaterThan(widthBefore);
  await page.mouse.up();
});

test("browser acceptance: grid visibility hides and shows the dashed field", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await expect(gridLines(page)).toHaveCount(14);

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.visible", async (control) => {
      await control.getByRole("switch", { name: "Visible" }).click();
    }),
    { requirementId: "grid.visible", selector: ISO_PRODUCT_SVG },
  );
  await expect(gridLines(page)).toHaveCount(0);

  await page
    .locator('[data-toolcraft-control-target="grid.visible"]')
    .getByRole("switch", { name: "Visible" })
    .click();
  await expect(gridLines(page)).toHaveCount(14);
});
