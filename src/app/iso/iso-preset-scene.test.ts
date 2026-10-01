import { describe, expect, it } from "vitest";

import { createIsoPresetScene, type IsoPresetImage } from "./iso-preset-scene";
import { ISO_PRESETS } from "./iso-presets";
import { getIsoSavedPresetCommand } from "./iso-saved-presets";
import {
  buildIsoSceneModelFromState,
  ISO_TARGETS,
  withIsoLoopProgress,
  type IsoStateSource,
} from "./iso-state";
import { asset, createState, record } from "./iso-test-fixtures";

/** The eight rolls the generator ships, as a host would hand them to the player. */
const NAMES = [
  "sushi_1",
  "sushi_2",
  "sushi_3",
  "sushi_4",
  "sushi_5",
  "sushi_6",
  "sushi_long_1",
  "sushi_long_2",
] as const;

const IMAGES: readonly IsoPresetImage[] = NAMES.map((name) => ({
  height: 150,
  name,
  url: `app://rolls/${name}.png`,
  width: 100,
}));

/** The same pictures as uploads, so the editor path has something to match by name. */
function editorState(): IsoStateSource {
  return createState(
    {
      [ISO_TARGETS.libraryObjects]: {
        activeId: null,
        items: Object.fromEntries(NAMES.map((name) => [name, record(name)])),
      },
    },
    NAMES.map((name) => asset(name)),
  );
}

/** A preset applied the way the panel applies it, as plain state. */
function applyInEditor(preset: (typeof ISO_PRESETS)[number]): IsoStateSource {
  const base = editorState();
  const command = getIsoSavedPresetCommand(base, preset);
  const values = command.type === "controls.apply" ? command.values : {};
  return { ...base, values: { ...base.values, ...values } };
}

describe("preset scene adapter", () => {
  it("draws every shipped preset exactly as the editor draws it", () => {
    ISO_PRESETS.forEach((preset) => {
      const player = createIsoPresetScene(preset, IMAGES);
      // Same geometry, same depth order, same pieces: the player reuses the
      // builders rather than reimplementing them, and this proves it.
      expect(
        buildIsoSceneModelFromState(player.state),
        preset.name,
      ).toEqual(buildIsoSceneModelFromState(applyInEditor(preset)));
    });
  });

  it("keeps matching the editor at every point of the wave", () => {
    const preset = ISO_PRESETS.find((entry) => entry.values[ISO_TARGETS.reliefWave] === true)!;
    const player = createIsoPresetScene(preset, IMAGES);
    const editor = applyInEditor(preset);

    [0, 0.25, 0.5, 0.75].forEach((progress) => {
      expect(
        buildIsoSceneModelFromState(withIsoLoopProgress(player.state, progress)),
        `progress ${progress}`,
      ).toEqual(buildIsoSceneModelFromState(withIsoLoopProgress(editor, progress)));
    });
  });

  it("reports the speed and the pictures it was not given", () => {
    const preset = ISO_PRESETS[0]!;
    expect(createIsoPresetScene(preset, IMAGES).loopSeconds).toBe(4);
    expect(createIsoPresetScene(preset, IMAGES).missing).toEqual([]);

    // A host that ships fewer rolls still gets a scene, minus the missing ones.
    const partial = createIsoPresetScene(preset, IMAGES.slice(0, 2));
    expect(partial.missing.length).toBeGreaterThan(0);
    expect([...partial.urls.keys()]).toEqual(["sushi_1", "sushi_2"]);
    expect(buildIsoSceneModelFromState(partial.state).items.length).toBeGreaterThan(0);
  });

  it("hands the scene the urls the host supplied", () => {
    const scene = createIsoPresetScene(ISO_PRESETS[0]!, IMAGES);
    expect(scene.urls.get("sushi_1")).toBe("app://rolls/sushi_1.png");
    expect(scene.state.mediaAssets.map((item) => item.id)).toEqual(
      ISO_PRESETS[0]!.objects.map((object) => object.name),
    );
  });
});
