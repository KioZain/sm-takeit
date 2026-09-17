import { describe, expect, it } from "vitest";

import { appSchema } from "../app-schema";
import { getIsoPresetCommand, ISO_PRESET_ACTIONS, ISO_PRESETS } from "./iso-presets";
import { buildIsoSceneModelFromState, ISO_TARGETS, ISO_WAVE_LOOP_SECONDS } from "./iso-state";
import {
  applyCommand,
  at,
  createState,
  exportFrame,
  heightMatrix,
  runAction,
  withPlacements,
} from "./iso-test-fixtures";

const wave = {
  [ISO_TARGETS.gridSize]: 6,
  [ISO_TARGETS.reliefPattern]: "corner-diagonal",
  [ISO_TARGETS.reliefWave]: true,
};

type Values = Record<string, unknown>;

function at_time(values: Values, currentTimeSeconds: number, durationSeconds = ISO_WAVE_LOOP_SECONDS) {
  return { ...createState(values), timeline: { currentTimeSeconds, durationSeconds } };
}

/** Heights along the top edge row, which runs straight away from the top-corner peak. */
function edgeRow(values: Values, seconds: number, duration = ISO_WAVE_LOOP_SECONDS): number[] {
  return heightMatrix(at_time(values, seconds, duration))[0]!;
}

function crestIndex(row: readonly number[]): number {
  return row.indexOf(Math.max(...row));
}

function videoSelect(target: string) {
  const section = appSchema.panels.controls?.sections.find((candidate) => candidate.id === "runtime.video-export");
  const control = Object.values(section?.controls ?? {}).find((candidate) => candidate.target === target);
  return control && "options" in control ? control.options?.map((option) => option.value) : [];
}

describe("sushi set motion acceptance", () => {
  it("presets apply complete grid and wave setups", () => {
    const { dispatched } = runAction(ISO_PRESET_ACTIONS[0]!.value, createState());
    expect(dispatched).toEqual([
      {
        history: "record",
        label: "Apply preset 1",
        type: "controls.apply",
        values: {
          "grid.levelHeight": 20,
          "grid.size": 4,
          "relief.corner": "top",
          "relief.max": 2,
          "relief.pattern": "corner-rings",
          "relief.wave": true,
          "relief.waveDirection": "outward",
          "relief.waveEasing": "sine",
          "relief.waveLength": 9,
        },
      },
    ]);
    const applied = { ...createState(), values: { ...createState().values, ...(dispatched[0]?.type === "controls.apply" ? dispatched[0].values : {}) } };
    expect(heightMatrix({ ...applied, timeline: { currentTimeSeconds: 0, durationSeconds: 4 } })).toHaveLength(4);
    expect(applyCommand(applied, null)).toBe(applied);
    expect(getIsoPresetCommand("preset.99")).toBeNull();
    expect(getIsoPresetCommand("field.clear")).toBeNull();

    // Every preset only sets real controls, with values those controls accept.
    const controls = new Map(
      (appSchema.panels.controls?.sections ?? []).flatMap((section) =>
        Object.values(section.controls).map((control) => [control.target, control] as const),
      ),
    );
    for (const preset of ISO_PRESETS) {
      for (const [target, value] of Object.entries(preset.values)) {
        const control = controls.get(target);
        expect(control, target).toBeDefined();
        if (control && "options" in control && control.options) {
          expect(control.options.map((option) => option.value), target).toContain(value);
        }
        if (control && control.type === "slider") {
          expect(value as number, target).toBeGreaterThanOrEqual(control.min ?? -Infinity);
          expect(value as number, target).toBeLessThanOrEqual(control.max ?? Infinity);
        }
      }
    }
    expect(ISO_PRESET_ACTIONS.map((action) => action.label)).toEqual(ISO_PRESETS.map((preset) => preset.label));
  });

  it("wave turns the relief into a looping travelling wave", () => {
    const moving = [0, 0.5, 1, 1.5].map((seconds) => edgeRow(wave, seconds));
    expect(new Set(moving.map((row) => row.join())).size).toBe(4);
    // Columns rise smoothly through fractional levels.
    expect(moving.flat().some((level) => !Number.isInteger(level))).toBe(true);
    const still = { ...wave, [ISO_TARGETS.reliefWave]: false };
    expect(edgeRow(still, 0)).toEqual(edgeRow(still, 1.5));
    // Flat has nothing to animate.
    const flat = { ...wave, [ISO_TARGETS.reliefPattern]: "flat" };
    expect(edgeRow(flat, 1).every((level) => level === 0)).toBe(true);
  });

  it("wave length spaces the crests", () => {
    const row = (length: number) => edgeRow({ ...wave, [ISO_TARGETS.reliefWaveLength]: length }, 1);
    const short = row(2);
    // Two cells apart, columns sit at the same phase.
    expect(short[0]).toBeCloseTo(short[2]!, 6);
    expect(short[1]).toBeCloseTo(short[3]!, 6);
    expect(row(12)).not.toEqual(short);
  });

  it("wave direction sends crests from or to the peak", () => {
    const direction = (value: string) => (seconds: number) =>
      crestIndex(edgeRow({ ...wave, [ISO_TARGETS.reliefWaveDirection]: value, [ISO_TARGETS.reliefWaveLength]: 12 }, seconds));
    const outward = direction("outward");
    const inward = direction("inward");
    expect(outward(0)).toBe(0);
    expect(outward(ISO_WAVE_LOOP_SECONDS / 4)).toBeGreaterThan(outward(0));
    expect(inward(ISO_WAVE_LOOP_SECONDS * 0.8)).toBeLessThan(inward(ISO_WAVE_LOOP_SECONDS * 0.7));
  });

  it("wave easing shapes how columns rise and fall", () => {
    const row = (easing: string) =>
      edgeRow({ ...wave, [ISO_TARGETS.reliefWaveEasing]: easing, [ISO_TARGETS.reliefWaveLength]: 8 }, 0.5);
    const easings = ["sine", "linear", "ease-in", "ease-out", "ease-in-out"];
    const rows = easings.map(row);
    expect(new Set(rows.map((levels) => levels.join())).size).toBe(easings.length);
    // Crests stay in place; only the in-between heights change.
    expect(new Set(rows.map(crestIndex)).size).toBe(1);
    // Ease in keeps columns lower than ease out on the way up.
    const sum = (levels: readonly number[]) => levels.reduce((total, level) => total + level, 0);
    expect(sum(row("ease-in"))).toBeLessThan(sum(row("ease-out")));
    // Every easing loops seamlessly.
    for (const easing of easings) {
      const values = { ...wave, [ISO_TARGETS.reliefWaveEasing]: easing };
      expect(edgeRow(values, ISO_WAVE_LOOP_SECONDS)).toEqual(edgeRow(values, 0));
    }
  });

  it("relief wave loops seamlessly on the timeline", () => {
    for (const duration of [ISO_WAVE_LOOP_SECONDS, 7]) {
      // The last frame wraps onto the first, whatever the loop length.
      expect(edgeRow(wave, duration, duration)).toEqual(edgeRow(wave, 0, duration));
      expect(edgeRow(wave, duration - 1e-6, duration)[0]).toBeCloseTo(edgeRow(wave, 0, duration)[0]!, 4);
      // The crest only moves forward through the loop.
      const crests = [0.05, 0.15, 0.25, 0.35].map((share) =>
        crestIndex(edgeRow({ ...wave, [ISO_TARGETS.reliefWaveLength]: 12 }, share * duration, duration)),
      );
      expect([...crests].sort((left, right) => left - right)).toEqual(crests);
      expect(crests[3]).toBeGreaterThan(crests[0]!);
    }
    // Half a loop is the same frame at any duration.
    expect(edgeRow(wave, 2, 4)).toEqual(edgeRow(wave, 3.5, 7));
  });

  it("video formats remain selectable", () => {
    expect(videoSelect("export.video.format")).toEqual(["mp4", "webm"]);
  });

  it("video resolutions remain selectable", () => {
    expect(videoSelect("export.video.resolution")).toEqual(["current", "4k"]);
  });

  it("video export renders the wave loop", async () => {
    const state = withPlacements([at("maki", 0, 0), at("nigiri", 3, 0)], wave);
    const start = await exportFrame(state, 1, 0);
    const middle = await exportFrame(state, 1, 0.5);
    const end = await exportFrame(state, 1, 1);
    expect(middle.images).not.toEqual(start.images);
    expect(end.images).toEqual(start.images);
    // Every frame is centred the same way, so the set does not jump between frames.
    const translate = (calls: readonly string[]) => calls.find((call) => call.startsWith("translate:"));
    expect(translate(middle.calls)).toBe(translate(start.calls));
  });

  it("infinity video export keeps one frame for the whole loop", () => {
    const values = { ...wave, [ISO_TARGETS.placements]: { items: [at("maki", 0, 0)] } };
    const models = [0, 0.7, 1.3, 2, 2.9].map((seconds) => buildIsoSceneModelFromState(at_time(values, seconds)));
    const frames = new Set(models.map((model) => JSON.stringify(model.worldFrame)));
    expect(frames.size).toBe(1);
    for (const model of models) {
      const rect = model.items[0]!.imageRect!;
      expect(rect.y).toBeGreaterThanOrEqual(model.frame.y);
      expect(rect.y + rect.height).toBeLessThanOrEqual(model.frame.y + model.frame.height);
    }
  });
});
