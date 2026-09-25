import * as React from "react";

/**
 * Russian names for the runtime-owned panel surfaces.
 *
 * The scaffold builds Setup and the export sections from its own modules and
 * reserves their ids and targets, so a product section cannot supply the titles,
 * and there is no localisation port. The published strings are therefore renamed
 * in place, in the panel the runtime already rendered, and re-applied whenever the
 * runtime repaints. Keys are the exact English strings the runtime draws.
 */
const ISO_RUNTIME_LABELS: Readonly<Record<string, string>> = {
  "Aspect ratio": "Пропорции",
  Background: "Фон",
  "Background color": "Цвет фона",
  Blanc: "Чистая",
  "Canvas height": "Высота холста",
  "Canvas width": "Ширина холста",
  Current: "Текущее",
  Custom: "Свои",
  Dots: "Точки",
  "Export JPG": "Экспорт JPG",
  "Export MP4": "Экспорт MP4",
  "Export PNG": "Экспорт PNG",
  "Export WebM": "Экспорт WebM",
  Format: "Формат",
  "Image Export": "Экспортировать изображение",
  // Paired with "Фон" in one row, where "Бесконечный холст" no longer fits.
  "Infinity canvas": "Бесконечный",
  "Ratio H": "Пропорция В",
  "Ratio W": "Пропорция Ш",
  Resolution: "Разрешение",
  Settings: "Настройки",
  Timeline: "Таймлайн",
  "Video Export": "Экспортировать видео",
  Workspace: "Рабочая область",
};

/**
 * Section titles, field labels, the value plus option text of runtime selects, and
 * the sticky export buttons, whose caption sits beside an icon.
 */
const LABEL_SELECTOR = [
  '[data-slot="panel-title"]',
  '[data-slot="template-field-label-text"]',
  '[data-slot="label"]',
  '[data-slot="select-value"] span',
  '[data-slot="button"]',
  '[role="option"] span',
].join(",");

function isTextNode(node: ChildNode): boolean {
  return node.nodeType === Node.TEXT_NODE;
}

function renameTextNode(node: ChildNode): void {
  const next = ISO_RUNTIME_LABELS[(node.nodeValue ?? "").trim()];
  if (next && node.nodeValue !== next) node.nodeValue = next;
}

/** Only direct text is replaced, so no runtime-owned element or icon is restructured. */
function renameLabel(node: Element): void {
  Array.from(node.childNodes).filter(isTextNode).forEach(renameTextNode);
}

/** Overflowing labels repeat themselves in a native tooltip. */
function renameTitleAttribute(node: HTMLElement): void {
  const next = ISO_RUNTIME_LABELS[node.title.trim()];
  if (next && node.title !== next) node.title = next;
}

function renameRuntimeLabels(): void {
  Array.from(document.querySelectorAll(LABEL_SELECTOR)).forEach(renameLabel);
  Array.from(document.querySelectorAll<HTMLElement>("[title]")).forEach(renameTitleAttribute);
}

/** Keep the runtime-owned panel strings in Russian for as long as the product is mounted. */
export function useIsoRuntimeSectionTitles(): void {
  React.useEffect(() => {
    renameRuntimeLabels();
    const observer = new MutationObserver(renameRuntimeLabels);
    observer.observe(document.body, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}
