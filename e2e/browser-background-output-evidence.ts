import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertToolcraftBrowserProofSession,
  getToolcraftBrowserActionTarget,
  readToolcraftBrowserObservation,
  runToolcraftBrowserValueAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserObservation,
} from "./browser-proof-session";
import {
  assertToolcraftProducedArtifact,
  validateToolcraftExportArtifactInspection,
  type ToolcraftExportArtifactInspection,
} from "./export-artifact-helpers";
import {
  createToolcraftSemanticTransitionOptions,
  expectToolcraftExpectedOutcomeAfterAction,
  type ToolcraftSemanticEvidenceOptions,
} from "./browser-acceptance-transition-helpers";

export type ToolcraftBackgroundPreviewObservation = {
  backgroundVisible: boolean;
  outputSignature: string;
};

export type ToolcraftBackgroundImageInspection =
  ToolcraftExportArtifactInspection & {
    backgroundAlpha: number;
    height: number;
    mediaType: string;
    width: number;
  };

export type ToolcraftBackgroundVideoInspection =
  ToolcraftExportArtifactInspection & {
    backgroundIncluded: boolean;
    mediaType: string;
  };

export type ToolcraftFiniteBackgroundStackingObservation = {
  backgroundColor: string;
  backgroundVisible: boolean;
  canvasMode: "finite" | "infinite";
  layerOrder: readonly string[];
  mediaVisible: boolean;
  outputSignature: string;
  productForegroundTransparent: boolean;
};

type ToolcraftBackgroundVideoProof<TArtifact> = {
  exportArtifact: ToolcraftBrowserAction<"interaction", TArtifact>;
  inspectArtifact: (
    artifact: TArtifact,
  ) => Promise<ToolcraftBackgroundVideoInspection> | ToolcraftBackgroundVideoInspection;
};

function requireTargetScopedAction(
  action: ToolcraftBrowserAction,
  message: string,
): string {
  const target = getToolcraftBrowserActionTarget(action);
  expect(target, message).toBeTruthy();
  return target!;
}

function validateBackgroundPreviewObservation(
  observation: ToolcraftBackgroundPreviewObservation,
  requirementId: string,
): void {
  expect(
    typeof observation.backgroundVisible,
    `Background requirement "${requirementId}" must report boolean preview visibility.`,
  ).toBe("boolean");
  expect(
    observation.outputSignature.trim(),
    `Background requirement "${requirementId}" must report a preview output signature.`,
  ).not.toBe("");
}

function validateFiniteBackgroundStacking(
  observation: ToolcraftFiniteBackgroundStackingObservation,
  requirementId: string,
): void {
  expect(
    observation.canvasMode,
    `Background requirement "${requirementId}" must inspect finite canvas mode.`,
  ).toBe("finite");
  expect(observation.backgroundVisible).toBe(true);
  expect(observation.mediaVisible).toBe(true);
  expect(observation.productForegroundTransparent).toBe(true);
  expect(observation.backgroundColor.trim()).not.toBe("");
  expect(observation.outputSignature.trim()).not.toBe("");

  const backgroundIndex = observation.layerOrder.indexOf("background");
  const mediaIndex = observation.layerOrder.indexOf("media");
  const productIndex = observation.layerOrder.indexOf("product");
  expect(backgroundIndex).toBeGreaterThanOrEqual(0);
  expect(mediaIndex).toBeGreaterThan(backgroundIndex);
  expect(productIndex).toBeGreaterThan(mediaIndex);
}

export async function expectToolcraftFiniteBackgroundMediaStacking(
  observeStacking: ToolcraftBrowserObservation<ToolcraftFiniteBackgroundStackingObservation>,
  enableBackground: ToolcraftBrowserAction,
  expected: ToolcraftFiniteBackgroundStackingObservation,
  options: ToolcraftSemanticEvidenceOptions,
): Promise<ToolcraftFiniteBackgroundStackingObservation> {
  assertToolcraftBrowserProofSession(observeStacking, enableBackground);
  const target = requireTargetScopedAction(
    enableBackground,
    "Finite-background stacking evidence requires a target-scoped Background switch action.",
  );
  const before = await readToolcraftBrowserObservation(observeStacking);
  expect(before.canvasMode).toBe("finite");
  expect(before.backgroundVisible).toBe(false);
  expect(before.mediaVisible).toBe(true);
  expect(before.productForegroundTransparent).toBe(true);
  expect(before.outputSignature.trim()).not.toBe("");
  validateFiniteBackgroundStacking(expected, options.requirementId);

  const { after } = await expectToolcraftExpectedOutcomeAfterAction(
    observeStacking,
    enableBackground,
    expected,
    createToolcraftSemanticTransitionOptions(
      `Background requirement "${options.requirementId}" should keep runtime media above the evaluated finite background.`,
      options,
    ),
  );
  validateFiniteBackgroundStacking(after, options.requirementId);
  expect(after.outputSignature).not.toBe(before.outputSignature);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "product-observable-change",
    requirementId: options.requirementId,
    target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "background-finite-media-stacking",
    requirementId: options.requirementId,
    target,
  });
  return after;
}

export async function expectToolcraftBackgroundOutputSemantics<
  TImageArtifact,
  TVideoArtifact = never,
>(
  observePreview: ToolcraftBrowserObservation<ToolcraftBackgroundPreviewObservation>,
  excludeBackground: ToolcraftBrowserAction,
  expectedPreview: ToolcraftBackgroundPreviewObservation,
  exportImageArtifact: ToolcraftBrowserAction<"interaction", TImageArtifact>,
  inspectImageArtifact: (
    artifact: TImageArtifact,
  ) => Promise<ToolcraftBackgroundImageInspection> | ToolcraftBackgroundImageInspection,
  options: ToolcraftSemanticEvidenceOptions & {
    video?: ToolcraftBackgroundVideoProof<TVideoArtifact>;
  },
): Promise<ToolcraftBackgroundPreviewObservation> {
  const actions: ToolcraftBrowserAction[] = [
    excludeBackground,
    exportImageArtifact,
    ...(options.video ? [options.video.exportArtifact] : []),
  ];
  assertToolcraftBrowserProofSession(observePreview, ...actions);
  const target = requireTargetScopedAction(
    excludeBackground,
    "Background-output evidence requires a target-scoped Include control action.",
  );
  const before = await readToolcraftBrowserObservation(observePreview);
  validateBackgroundPreviewObservation(before, options.requirementId);
  validateBackgroundPreviewObservation(expectedPreview, options.requirementId);
  expect(
    before.backgroundVisible,
    `Background requirement "${options.requirementId}" must begin with the preview background included.`,
  ).toBe(true);
  expect(
    expectedPreview.backgroundVisible,
    `Background requirement "${options.requirementId}" must expect the preview background to be excluded.`,
  ).toBe(false);

  const { after } = await expectToolcraftExpectedOutcomeAfterAction(
    observePreview,
    excludeBackground,
    expectedPreview,
    createToolcraftSemanticTransitionOptions(
      `Background requirement "${options.requirementId}" should hide the product preview background.`,
      options,
    ),
  );
  expect(after.outputSignature).not.toBe(before.outputSignature);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "product-observable-change",
    requirementId: options.requirementId,
    target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "background-preview-exclusion",
    requirementId: options.requirementId,
    target,
  });

  const imageArtifact = await runToolcraftBrowserValueAction(exportImageArtifact);
  assertToolcraftProducedArtifact(imageArtifact, options.requirementId);
  const imageInspection = await inspectImageArtifact(imageArtifact);
  validateToolcraftExportArtifactInspection(imageInspection, options.requirementId);
  expect(imageInspection.mediaType).toMatch(/^image\//);
  expect(imageInspection.width).toBeGreaterThan(0);
  expect(imageInspection.height).toBeGreaterThan(0);
  expect(Number.isSafeInteger(imageInspection.backgroundAlpha)).toBe(true);
  expect(imageInspection.backgroundAlpha).toBe(0);
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "exported-artifact",
    requirementId: options.requirementId,
    target,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "background-image-transparency",
    requirementId: options.requirementId,
    target,
  });

  if (options.video) {
    const videoArtifact = await runToolcraftBrowserValueAction(
      options.video.exportArtifact,
    );
    assertToolcraftProducedArtifact(videoArtifact, options.requirementId);
    const videoInspection = await options.video.inspectArtifact(videoArtifact);
    validateToolcraftExportArtifactInspection(videoInspection, options.requirementId);
    expect(videoInspection.mediaType).toMatch(/^video\//);
    expect(videoInspection.backgroundIncluded).toBe(true);
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "background-video-preserved",
      requirementId: options.requirementId,
      target,
    });
  }

  return after;
}
