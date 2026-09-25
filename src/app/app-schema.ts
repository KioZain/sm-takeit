import {
  canvasEditingModule,
  defineToolcraft,
  imageExportModule,
  mediaSourceModule,
  timelineModule,
  type ToolcraftControlSchema,
  videoExportModule,
} from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { ISO_EMPTY_SAVED_PRESETS } from "./iso/iso-saved-presets";
import { appIdentity } from "./app-identity";
import {
  isoCompositionControlType,
  isoObjectLibraryControlType,
  isoSavedPresetsControlType,
} from "./iso/iso-control-types";
import {
  ISO_ACTIONS,
  ISO_DEFAULTS,
  ISO_EMPTY_LIBRARY,
  ISO_EMPTY_PLACEMENTS,
  ISO_GRID_SIZE_RANGE,
  ISO_WAVE_LENGTH_RANGE,
  ISO_WAVE_LOOP_SECONDS,
  ISO_LIBRARY_MAX_OBJECTS,
  ISO_TARGETS,
} from "./iso/iso-state";

const always = { mode: "always" } as const;
const RAISED_PATTERNS = [
  "corner-diagonal",
  "corner-rings",
  "edge",
  "pyramid",
  "checker",
  "alternate-rows",
  "alternate-cols",
] as const;
const usesPeak = {
  all: [{ oneOf: RAISED_PATTERNS, target: ISO_TARGETS.reliefPattern }],
  mode: "conditional",
} as const;
const usesCorner = {
  all: [{ oneOf: ["corner-diagonal", "corner-rings"], target: ISO_TARGETS.reliefPattern }],
  mode: "conditional",
} as const;
const usesEdge = {
  all: [{ equals: "edge", target: ISO_TARGETS.reliefPattern }],
  mode: "conditional",
} as const;
const usesWave = {
  all: [
    { oneOf: RAISED_PATTERNS, target: ISO_TARGETS.reliefPattern },
    { equals: true, target: ISO_TARGETS.reliefWave },
  ],
  mode: "conditional",
} as const;
const SLOPE_PATTERNS = ["corner-diagonal", "corner-rings", "edge", "pyramid"] as const;
const usesFalloff = {
  all: [
    { oneOf: SLOPE_PATTERNS, target: ISO_TARGETS.reliefPattern },
    { equals: false, target: ISO_TARGETS.reliefWave },
  ],
  mode: "conditional",
} as const;
const usesWaveSlope = {
  all: [
    { oneOf: SLOPE_PATTERNS, target: ISO_TARGETS.reliefPattern },
    { equals: true, target: ISO_TARGETS.reliefWave },
  ],
  mode: "conditional",
} as const;
const cropsToFrame = {
  all: [{ oneOf: ["field", "content"], target: ISO_TARGETS.crop }],
  mode: "conditional",
} as const;

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    canvas: {
      enabled: true,
      size: { height: 264, unit: "px", width: 480 },
      sizing: { mode: "editable-output" },
      upload: true,
    },
    identity: appIdentity,
    panels: {
      controls: {
        sections: [
          {
            controls: {
              saved: {
                applicability: always,
                defaultValue: ISO_EMPTY_SAVED_PRESETS,
                description:
                  "Каждая кнопка применяет свой набор настроек сетки и рельефа. Локально пресеты можно переименовать, перезаписать текущими настройками и переставить.",
                label: false,
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.savedPresets,
                type: isoSavedPresetsControlType,
              } satisfies ToolcraftControlSchema,
            },
            description:
              "Готовые настройки сетки и волны рельефа. Нажатие применяет пресет одним шагом, отмена возвращает прежние значения.",
            id: "presets",
            title: "Пресеты",
          },
          {
            controls: {
              includeBackground: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.includeBackground,
                label: "Include",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.includeBackground,
                type: "switch",
              } satisfies ToolcraftControlSchema,
              background: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.background,
                label: false,
                performanceRole: "responsiveness",
                target: ISO_TARGETS.background,
                type: "color",
              } satisfies ToolcraftControlSchema,
            },
            id: "background",
            layoutGroups: [
              { columns: 2, controls: ["includeBackground", "background"], layout: "inline" },
            ],
            title: "Background",
          },
          {
            controls: {
              cols: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.gridCols,
                description:
                  "Клеток вдоль правой стороны поля (↘), от 1 до 8. Роллы и высоты за краем сохраняются и возвращаются, когда поле растёт.",
                label: "Ширина",
                max: ISO_GRID_SIZE_RANGE.max,
                min: ISO_GRID_SIZE_RANGE.min,
                orderRole: "primary",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.gridCols,
                type: "slider",
                unit: "кл.",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              rows: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.gridRows,
                description:
                  "Клеток вдоль левой стороны поля (↙), от 1 до 8. Роллы и высоты за краем сохраняются и возвращаются, когда поле растёт.",
                label: "Длина",
                max: ISO_GRID_SIZE_RANGE.max,
                min: ISO_GRID_SIZE_RANGE.min,
                orderRole: "primary",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.gridRows,
                type: "slider",
                unit: "кл.",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              visible: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.gridVisible,
                label: "Показывать сетку",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.gridVisible,
                type: "switch",
              } satisfies ToolcraftControlSchema,
              showPieces: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.showPieces,
                description:
                  "Скрывает все роллы на холсте, в превью карточек и в PNG; расстановка сохраняется. Включите «Показывать сетку при экспорте», чтобы сохранить только сетку.",
                label: "Показывать роллы",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.showPieces,
                type: "switch",
              } satisfies ToolcraftControlSchema,
            },
            id: "grid",
            title: "Сетка",
          },
          {
            controls: {
              images: {
                accept: ".png,image/png",
                applicability: always,
                assetKind: "file",
                hardMaxItems: ISO_LIBRARY_MAX_OBJECTS,
                label: false,
                multiple: true,
                orderRole: "input",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.libraryFiles,
                type: "fileDrop",
              } satisfies ToolcraftControlSchema,
            },
            description: "PNG роллов с прозрачным фоном; каждый файл становится объектом для расстановки.",
            id: "images",
            title: "Загрузка",
          },
          {
            controls: {
              objects: {
                applicability: always,
                defaultValue: ISO_EMPTY_LIBRARY,
                description:
                  "Выберите изображение, кликните по увеличенному превью, чтобы задать точку опоры, и настройте имя, площадь и масштаб.",
                label: false,
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.libraryObjects,
                type: isoObjectLibraryControlType,
              } satisfies ToolcraftControlSchema,
            },
            id: "library",
            title: "Изображения",
          },
          {
            controls: {
              tool: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.tool,
                description:
                  "Поставить — кладёт выбранное изображение на клетку, Стереть — убирает ролл, по которому кликнули.",
                label: "Режим",
                options: [
                  { label: "Поставить", value: "place" },
                  { label: "Стереть", value: "erase" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.tool,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              commands: {
                actions: [
                  { icon: "eraser", label: "Очистить поле", value: ISO_ACTIONS.clearField },
                ],
                applicability: always,
                label: false,
                orderRole: "action",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.commands,
                type: "actions",
              } satisfies ToolcraftControlSchema,
              composition: {
                applicability: always,
                defaultValue: ISO_EMPTY_PLACEMENTS,
                description: "Количество роллов каждого объекта и превью сета в размере карточки приложения.",
                label: "Состав",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.placements,
                type: isoCompositionControlType,
              } satisfies ToolcraftControlSchema,
            },
            id: "field",
            title: "Поле",
          },
          {
            controls: {
              pattern: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.reliefPattern,
                description:
                  "Форма рельефа: как поднимаются колонки. Меняется сразу при выборе.",
                label: "Вид анимации",
                options: [
                  { label: "Ровное поле", value: "flat" },
                  { label: "Угол, диагонали", value: "corner-diagonal" },
                  { label: "Угол, кольца", value: "corner-rings" },
                  { label: "Скат от края", value: "edge" },
                  { label: "Пирамида", value: "pyramid" },
                  { label: "Шахматка", value: "checker" },
                  { label: "Через ряд", value: "alternate-rows" },
                  { label: "Через столбец", value: "alternate-cols" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefPattern,
                type: "select",
              } satisfies ToolcraftControlSchema,
              corner: {
                applicability: usesCorner,
                defaultValue: ISO_DEFAULTS.reliefCorner,
                description: "Угол поля, в котором находится пик.",
                label: "Направление пика",
                options: [
                  { label: "Верх", value: "top" },
                  { label: "Право", value: "right" },
                  { label: "Низ", value: "bottom" },
                  { label: "Лево", value: "left" },
                ],
                orderRole: "primary",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefCorner,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              edge: {
                applicability: usesEdge,
                defaultValue: ISO_DEFAULTS.reliefEdge,
                description: "Сторона поля, от которой начинается скат.",
                label: "Сторона",
                options: [
                  { label: "↖", value: "top-left" },
                  { label: "↗", value: "top-right" },
                  { label: "↘", value: "bottom-right" },
                  { label: "↙", value: "bottom-left" },
                ],
                orderRole: "primary",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefEdge,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              max: {
                applicability: usesPeak,
                defaultValue: ISO_DEFAULTS.reliefMax,
                label: "Высота пика",
                max: 8,
                min: 1,
                orderRole: "strength",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.reliefMax,
                type: "slider",
                unit: "ур.",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              step: {
                applicability: usesFalloff,
                defaultValue: ISO_DEFAULTS.reliefStep,
                description: "Сколько клеток проходит скат, прежде чем опуститься на уровень.",
                label: "Спад",
                max: 4,
                min: 1,
                orderRole: "detail",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.reliefStep,
                type: "slider",
                unit: "кл.",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              wave: {
                applicability: usesPeak,
                defaultValue: ISO_DEFAULTS.reliefWave,
                description:
                  "Запускает рельеф плавной зацикленной волной. За один цикл волна сдвигается на один гребень.",
                label: "Анимация",
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefWave,
                type: "switch",
              } satisfies ToolcraftControlSchema,
              waveLength: {
                applicability: usesWaveSlope,
                defaultValue: ISO_DEFAULTS.reliefWaveLength,
                description: "Расстояние между двумя гребнями.",
                label: "Длина волны",
                max: ISO_WAVE_LENGTH_RANGE.max,
                min: ISO_WAVE_LENGTH_RANGE.min,
                orderRole: "detail",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.reliefWaveLength,
                type: "slider",
                unit: "кл.",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              waveDirection: {
                applicability: usesWaveSlope,
                defaultValue: ISO_DEFAULTS.reliefWaveDirection,
                label: "Направление",
                options: [
                  { label: "От пика", value: "outward" },
                  { label: "К пику", value: "inward" },
                ],
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefWaveDirection,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              waveEasing: {
                applicability: usesWave,
                defaultValue: ISO_DEFAULTS.reliefWaveEasing,
                description: "Как колонки ускоряются и замедляются, поднимаясь к гребню и опускаясь обратно.",
                label: "Настройки анимации",
                options: [
                  { label: "Синус", value: "sine" },
                  { label: "Линейный", value: "linear" },
                  { label: "Разгон", value: "ease-in" },
                  { label: "Торможение", value: "ease-out" },
                  { label: "Разгон и торможение", value: "ease-in-out" },
                ],
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefWaveEasing,
                type: "select",
              } satisfies ToolcraftControlSchema,
            },
            id: "relief",
            title: "Рельеф",
          },
          {
            controls: {
              crop: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.crop,
                description:
                  "Поле и Контент подгоняют артборд под сет, чтобы PNG был обрезан. Контент скрывает пустые клетки вокруг сета.",
                label: "Обрезка",
                options: [
                  { label: "Нет", value: "off" },
                  { label: "Поле", value: "field" },
                  { label: "Контент", value: "content" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.crop,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              padding: {
                applicability: cropsToFrame,
                defaultValue: ISO_DEFAULTS.padding,
                label: "Отступ",
                max: 200,
                min: 0,
                orderRole: "detail",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: ISO_TARGETS.padding,
                type: "slider",
                unit: "px",
              } satisfies ToolcraftControlSchema,
              includeGrid: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.includeGrid,
                label: "Показывать сетку при экспорте",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.includeGrid,
                type: "switch",
              } satisfies ToolcraftControlSchema,
            },
            id: "framing",
            title: "Кадрирование",
          },
        ],
        title: "Сет суши",
      },
    },
    persistence: {
      // Hand height edits are canvas-owned values without a panel control.
      additionalValueTargets: [ISO_TARGETS.reliefEdits],
      storage: "localStorage",
    },
    toolbar: {
      history: true,
      radar: true,
      // Light is the only published theme, so the toggle is hidden.
      theme: false,
      zoom: true,
    },
  },
  modules: [
    mediaSourceModule(),
    canvasEditingModule(),
    timelineModule({ defaultDurationSeconds: ISO_WAVE_LOOP_SECONDS, mode: "playback" }),
    imageExportModule(),
    videoExportModule(),
  ],
});
