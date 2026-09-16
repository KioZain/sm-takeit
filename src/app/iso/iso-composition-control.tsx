import { ArrowsOutSimpleIcon } from "@phosphor-icons/react";
import * as React from "react";

import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";
import {
  useToolcraftMediaPresentationUrls,
  type ToolcraftCustomControlRendererProps,
} from "@/toolcraft/runtime/react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@/toolcraft/ui";

import { getIsoViewBox, IsoSceneLayers } from "./iso-scene";
import {
  buildIsoSceneModelFromState,
  getIsoCompositionSummary,
  getIsoLibraryAssets,
  readIsoGridVisible,
  readIsoSceneInput,
  ISO_TARGETS,
} from "./iso-state";
import styles from "./iso-controls.module.css";

export const ISO_CARD_WIDTHS = [170, 340] as const;

function CardPreview({
  state,
  urls,
  width,
}: Readonly<{
  state: ToolcraftCustomControlRendererProps["state"];
  urls: ReadonlyMap<string, string>;
  width: number;
}>): React.JSX.Element {
  const model = buildIsoSceneModelFromState(state);
  const input = readIsoSceneInput(state);
  const height = Math.round((width * model.frame.height) / model.frame.width);
  const background =
    state.values[ISO_TARGETS.includeBackground] === true
      ? String(state.values[ISO_TARGETS.background] ?? "")
      : undefined;
  return (
    <div
      className={styles.card}
      data-iso-card-width={width}
      style={{ background, height, width }}
    >
      <svg
        className={styles.cardScene}
        data-iso-card-scene=""
        height={height}
        viewBox={getIsoViewBox(model)}
        width={width}
        xmlns="http://www.w3.org/2000/svg"
      >
        <IsoSceneLayers
          appearance={{ showGrid: readIsoGridVisible(state.values) && input.includeGrid }}
          imageUrls={urls}
          model={model}
        />
      </svg>
    </div>
  );
}

/** Composition summary: pieces per object, total, and card-size previews. */
export function IsoCompositionControl({
  controlId,
  state,
}: ToolcraftCustomControlRendererProps): React.JSX.Element {
  const libraryAssets = React.useMemo(
    () => getIsoLibraryAssets<ToolcraftMediaAsset>(state.mediaAssets),
    [state.mediaAssets],
  );
  const urls = useToolcraftMediaPresentationUrls(libraryAssets);
  const summary = getIsoCompositionSummary(state);
  const [smallWidth, largeWidth] = ISO_CARD_WIDTHS;

  return (
    <div className={styles.composition} data-iso-control={controlId}>
      {summary.rows.length > 0 ? (
        <ul aria-label="Pieces per object" className={styles.counts}>
          {summary.rows.map((row) => (
            <li className={styles.countRow} data-iso-count={row.id} key={row.id}>
              {urls.get(row.id) ? (
                <img alt="" className={styles.countThumb} src={urls.get(row.id)} />
              ) : (
                <span />
              )}
              <span className={styles.countName}>{row.name}</span>
              <span className={styles.countValue}>×{row.count}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.total}>
        <span>Total</span>
        <span className={styles.totalValue} data-iso-total="">
          {summary.total}
        </span>
      </div>
      <div className={styles.cards}>
        <CardPreview state={state} urls={urls} width={smallWidth} />
        <Popover>
          <PopoverTrigger render={<Button size="sm" variant="outline" />}>
            <ArrowsOutSimpleIcon data-icon="inline-start" />
            {largeWidth} px
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={styles.largeCardPopover}
            side="left"
            sideOffset={16}
          >
            <CardPreview state={state} urls={urls} width={largeWidth} />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
