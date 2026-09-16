import { deflateSync } from "node:zlib";

import { expect, type Locator, type Page } from "@playwright/test";

export type IsoRollFixture = Readonly<{
  buffer: Buffer;
  mimeType: "image/png";
  name: string;
  rgb: readonly [number, number, number];
}>;

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * A transparent PNG with one opaque elliptical "roll" resting on the bottom
 * edge, so the default floor anchor (0.5, 0.9) sits inside the roll.
 */
export function createIsoRollPng(
  name: string,
  rgb: readonly [number, number, number],
  size: Readonly<{ height: number; width: number }> = { height: 96, width: 80 },
): IsoRollFixture {
  const { height, width } = size;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  const centerX = (width - 1) / 2;
  const centerY = height * 0.62;
  const radiusX = width * 0.46;
  const radiusY = height * 0.36;
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const inside = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 <= 1;
      const offset = row + 1 + x * 4;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
      raw[offset + 3] = inside ? 255 : 0;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array()),
  ]);
  return Object.freeze({ buffer, mimeType: "image/png", name, rgb });
}

export const ISO_ROLLS = Object.freeze({
  maki: createIsoRollPng("maki.png", [214, 40, 57]),
  nigiri: createIsoRollPng("nigiri.png", [36, 120, 220]),
});

export const ISO_PRODUCT_SVG = '[data-toolcraft-product-output="sushi-set"]';

export async function openIsoApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(ISO_PRODUCT_SVG)).toBeVisible();
}

export async function uploadIsoRolls(
  page: Page,
  rolls: readonly IsoRollFixture[],
): Promise<void> {
  const owner = page.locator('[data-toolcraft-control-target="library.files"]');
  await owner.locator('input[type="file"]').first().setInputFiles(
    rolls.map((roll) => ({ buffer: roll.buffer, mimeType: roll.mimeType, name: roll.name })),
  );
  await expect(page.locator("[data-iso-object]")).toHaveCount(rolls.length);
}

/**
 * Presses a slider thumb and drags it to `fraction` of the track without
 * releasing, so callers can assert live output before `page.mouse.up()`.
 */
export async function holdIsoSliderAt(control: Locator, page: Page, fraction: number): Promise<void> {
  const input = control.locator('input[type="range"]');
  const min = Number(await input.getAttribute("min"));
  const max = Number(await input.getAttribute("max"));
  const value = Number(await input.inputValue());
  const track = control.locator('[data-slot="slider"]').first();
  const box = await track.boundingBox();
  if (!box) throw new Error("The slider track has no layout box.");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + (box.width * (value - min)) / (max - min), y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fraction, y, { steps: 8 });
}

export function isoFieldHandle(page: Page): Locator {
  return page.locator('[data-testid="iso-field"]');
}

/** Placement ids currently rendered as images, in drawing order. */
export async function readIsoPlacementIds(page: Page): Promise<string[]> {
  return page
    .locator(`${ISO_PRODUCT_SVG} [data-iso-placement]`)
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-iso-placement") ?? ""));
}

export async function readIsoTotal(page: Page): Promise<number> {
  return Number(await page.locator("[data-iso-total]").textContent());
}
