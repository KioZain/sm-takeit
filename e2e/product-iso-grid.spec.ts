import type { Locator, Page } from "@playwright/test";

import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftDiscreteSliderMarkers } from "./performance-control-layout-helpers";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { holdIsoSliderAt, ISO_PRODUCT_SVG, openIsoApp } from "./product-iso-test-support";
import { expect, test } from "./toolcraft-product-test";

/** The dashed guide path; `data-iso-grid-segments` counts its edges. */
function gridGuide(page: Page): Locator {
  return page.locator(`${ISO_PRODUCT_SVG} [data-iso-layer="grid"] [data-iso-grid-segments]`);
}

// A flat N×N field has 2·N·(N + 1) guide edges.
const segmentsFor = (size: number) => String(2 * size * (size + 1));

test("browser acceptance: grid size slider rebuilds the field", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6));
  await expectToolcraftDiscreteSliderMarkers(page, "grid.size");

  // Drag to the maximum and keep holding: the field is rebuilt mid-drag.
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.size", async (control, currentPage) => {
      await holdIsoSliderAt(control, currentPage, 1);
    }),
    { requirementId: "grid.size", selector: ISO_PRODUCT_SVG },
  );
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(8));
  await page.mouse.up();

  const control = page.locator('[data-toolcraft-control-target="grid.size"]');
  await holdIsoSliderAt(control, page, 0);
  await page.mouse.up();
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(2));
  await expect(control).toContainText("2 cells");
});

test("browser acceptance: cell size resizes the field live", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  const svg = page.locator(ISO_PRODUCT_SVG);
  const widthBefore = Number(await svg.getAttribute("width"));

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.cellSize", async (control, currentPage) => {
      await holdIsoSliderAt(control, currentPage, 0.75);
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
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6));

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.visible", async (control) => {
      await control.getByRole("switch", { name: "Visible" }).click();
    }),
    { requirementId: "grid.visible", selector: ISO_PRODUCT_SVG },
  );
  await expect(gridGuide(page)).toHaveCount(0);

  await page
    .locator('[data-toolcraft-control-target="grid.visible"]')
    .getByRole("switch", { name: "Visible" })
    .click();
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6));
});
