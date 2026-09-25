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

// A flat cols×rows field has 2·cols·rows + cols + rows guide edges.
const segmentsFor = (cols: number, rows = cols) => String(2 * cols * rows + cols + rows);

test("browser acceptance: grid width slider rebuilds the field", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6));
  await expectToolcraftDiscreteSliderMarkers(page, "grid.cols");

  // Drag to the maximum and keep holding: the field is rebuilt mid-drag.
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.cols", async (control, currentPage) => {
      await holdIsoSliderAt(control, currentPage, 1);
    }),
    { requirementId: "grid.cols", selector: ISO_PRODUCT_SVG },
  );
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(8, 6));
  await page.mouse.up();

  const control = page.locator('[data-toolcraft-control-target="grid.cols"]');
  await holdIsoSliderAt(control, page, 0);
  await page.mouse.up();
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(1, 6));
  await expect(control).toContainText("1 кл.");
});

test("browser acceptance: grid length slider rebuilds the field", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6));
  await expectToolcraftDiscreteSliderMarkers(page, "grid.rows");

  // Drag to the maximum and keep holding: the field is rebuilt mid-drag.
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.rows", async (control, currentPage) => {
      await holdIsoSliderAt(control, currentPage, 1);
    }),
    { requirementId: "grid.rows", selector: ISO_PRODUCT_SVG },
  );
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6, 8));
  await page.mouse.up();

  const control = page.locator('[data-toolcraft-control-target="grid.rows"]');
  await holdIsoSliderAt(control, page, 0);
  await page.mouse.up();
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6, 1));
  await expect(control).toContainText("1 кл.");
});

test("browser acceptance: grid visibility hides and shows the dashed field", async ({ page }) => {
  await openIsoApp(page);
  const session = await createToolcraftBrowserProofSession(page);
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6));

  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("grid.visible", async (control) => {
      await control.getByRole("switch", { name: "Показывать сетку" }).click();
    }),
    { requirementId: "grid.visible", selector: ISO_PRODUCT_SVG },
  );
  await expect(gridGuide(page)).toHaveCount(0);

  await page
    .locator('[data-toolcraft-control-target="grid.visible"]')
    .getByRole("switch", { name: "Показывать сетку" })
    .click();
  await expect(gridGuide(page)).toHaveAttribute("data-iso-grid-segments", segmentsFor(6));
});
