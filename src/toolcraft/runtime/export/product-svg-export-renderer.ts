import type { ToolcraftRendererPipelineClient } from "../rendering";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import type { ToolcraftExportFrame } from "./export-frame";

export type ToolcraftProductSvgExportFrameContext = Readonly<{
  container: SVGGElement;
  frame: ToolcraftExportFrame;
  rendererPipeline: ToolcraftRendererPipelineClient | null;
  signal: AbortSignal;
  state: ReadonlyToolcraftState;
  timeSeconds: number;
  timelineProgress: number;
}>;

export type ToolcraftProductSvgExportFrameRenderer = (
  context: ToolcraftProductSvgExportFrameContext,
) => PromiseLike<void> | void;

export type ToolcraftProductSvgExportRenderer = Readonly<{
  baseFileName: string;
  renderFrame: ToolcraftProductSvgExportFrameRenderer;
}>;
