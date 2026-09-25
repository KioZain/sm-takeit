import {
  ArrowCounterClockwiseIcon,
  DotsSixVerticalIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import * as React from "react";

import type { ToolcraftCustomControlRendererProps } from "@/toolcraft/runtime/react";
import { Anchor, Button, ControlFieldLabel, Input } from "@/toolcraft/ui";

import { CommitInput } from "./iso-commit-input";
import {
  getIsoPresetRows,
  moveIsoPreset,
  overwriteIsoPreset,
  renameIsoPreset,
  resetIsoPreset,
  toIsoPresetsFile,
  type IsoPresetRow,
} from "./iso-preset-list";
import {
  addIsoSavedPreset,
  createIsoSavedPreset,
  getIsoSavedPresetCommand,
  getIsoSavedPresetMatch,
  readIsoSavedPresets,
  type IsoSavedPresetsValue,
} from "./iso-saved-presets";
import styles from "./iso-controls.module.css";

const PRESETS_FILE_NAME = "teikido-presets.json";

/**
 * Authoring presets — renaming, overwriting, reordering, saving and the handover
 * file — belongs to local work on the generator. A published build lists the
 * preset names only, so the people using the tool just pick a set.
 */
const PRESET_EDITING = import.meta.env.DEV;

/** A preset file is plain text, so it travels as a data URL without a blob handle. */
function getPresetsHref(rows: readonly IsoPresetRow[]): string {
  return `data:application/json;charset=utf-8,${encodeURIComponent(toIsoPresetsFile(rows))}`;
}

function getRowNote(row: IsoPresetRow, missing: readonly string[]): string | null {
  const parts = [
    row.overridden ? "Изменён" : null,
    missing.length > 0 ? `не загружено: ${missing.join(", ")}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function PresetEditor({
  missing,
  onDragEnd,
  onDragStart,
  onDropOn,
  onOverwrite,
  onRename,
  onReset,
  onStep,
  row,
}: Readonly<{
  missing: readonly string[];
  onDragEnd: () => void;
  onDragStart: () => void;
  onDropOn: () => void;
  onOverwrite: () => void;
  onRename: (name: string) => void;
  onReset: () => void;
  onStep: (direction: 1 | -1) => void;
  row: IsoPresetRow;
}>): React.JSX.Element {
  const { name } = row.preset;
  const note = getRowNote(row, missing);
  return (
    <>
      <div className={styles.presetLine}>
        <Button
          aria-label={`Переставить пресет «${name}»`}
          className={styles.presetHandle}
          draggable
          onDragEnd={onDragEnd}
          onDragOver={(event) => event.preventDefault()}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", row.preset.id);
            onDragStart();
          }}
          onDrop={(event) => {
            event.preventDefault();
            onDropOn();
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            onStep(event.key === "ArrowUp" ? -1 : 1);
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <DotsSixVerticalIcon />
        </Button>
        <CommitInput
          aria-label={`Имя пресета «${name}»`}
          id={`preset-name-${row.preset.id}`}
          onCommit={onRename}
          value={name}
        />
        <Button onClick={onOverwrite} size="sm" type="button" variant="outline">
          Перезаписать
        </Button>
        {row.builtIn ? (
          <Button
            aria-label={`Вернуть пресет «${name}» к исходному`}
            disabled={!row.overridden}
            onClick={onReset}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ArrowCounterClockwiseIcon />
          </Button>
        ) : (
          <Button
            aria-label={`Удалить пресет «${name}»`}
            onClick={onReset}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <TrashIcon />
          </Button>
        )}
      </div>
      {note ? <p className={styles.presetNote}>{note}</p> : null}
    </>
  );
}

export function IsoSavedPresetsControl({
  controlId,
  dispatch,
  setValue,
  state,
}: ToolcraftCustomControlRendererProps): React.JSX.Element {
  const [draftName, setDraftName] = React.useState("");
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const saved = readIsoSavedPresets(state.values);
  const rows = getIsoPresetRows(state.values);
  const commit = (next: IsoSavedPresetsValue) => setValue(next);

  const move = (movedId: string, targetId: string) =>
    commit(moveIsoPreset(saved, rows, movedId, targetId));

  const step = (id: string, direction: 1 | -1) => {
    const target = rows[rows.findIndex((row) => row.preset.id === id) + direction];
    if (target) move(id, target.preset.id);
  };

  const save = () => {
    const name = draftName.trim() || `Пресет ${rows.length + 1}`;
    const preset = createIsoSavedPreset(
      state,
      name,
      `preset-${Date.now().toString(36)}`,
      new Date().toISOString(),
    );
    commit(addIsoSavedPreset(saved, preset));
    setDraftName("");
  };

  return (
    <div className={styles.presets} data-iso-control={controlId}>
      <ul className={styles.presetList} data-iso-preset-rows={rows.length}>
        {rows.map((row) => (
          <li
            className={styles.presetRow}
            data-dragging={draggingId === row.preset.id ? "" : undefined}
            data-editing={PRESET_EDITING ? "" : undefined}
            data-iso-preset={row.preset.id}
            key={row.preset.id}
          >
            <Button
              className={styles.presetApply}
              onClick={() => dispatch(getIsoSavedPresetCommand(state, row.preset))}
              size="sm"
              type="button"
              variant="outline"
            >
              {row.preset.name}
            </Button>
            {PRESET_EDITING ? (
              <PresetEditor
                missing={getIsoSavedPresetMatch(state, row.preset).missing}
                onDragEnd={() => setDraggingId(null)}
                onDragStart={() => setDraggingId(row.preset.id)}
                onDropOn={() => {
                  if (draggingId) move(draggingId, row.preset.id);
                  setDraggingId(null);
                }}
                onOverwrite={() =>
                  commit(overwriteIsoPreset(saved, row, state, new Date().toISOString()))
                }
                onRename={(name) => commit(renameIsoPreset(saved, row, name))}
                onReset={() => commit(resetIsoPreset(saved, row))}
                onStep={(direction) => step(row.preset.id, direction)}
                row={row}
              />
            ) : null}
          </li>
        ))}
      </ul>

      {PRESET_EDITING ? (
        <>
          <div className={styles.field}>
            <ControlFieldLabel htmlFor={`${controlId}-name`}>Новый пресет</ControlFieldLabel>
            <div className={styles.presetLine}>
              <Input
                aria-label="Имя нового пресета"
                id={`${controlId}-name`}
                onChange={(event) => setDraftName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    save();
                  }
                }}
                placeholder="Имя пресета"
                value={draftName}
              />
              <Button onClick={save} size="sm" type="button" variant="outline">
                <FloppyDiskIcon data-icon="inline-start" />
                Сохранить
              </Button>
            </div>
          </div>

          <Button
            render={<Anchor download={PRESETS_FILE_NAME} href={getPresetsHref(rows)} />}
            size="sm"
            variant="outline"
          >
            <DownloadSimpleIcon data-icon="inline-start" />
            Скачать все пресеты
          </Button>
        </>
      ) : null}
    </div>
  );
}
