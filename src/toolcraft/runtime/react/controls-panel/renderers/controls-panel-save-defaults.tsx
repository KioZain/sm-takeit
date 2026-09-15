"use client";
import * as React from "react";
import { Button, FieldDescription, FieldError, PanelActions } from "@/toolcraft/ui";
import { createToolcraftAppDefaults } from "../../../schema/app-defaults";
import type { ToolcraftState } from "../../../state/types";
import { useToolcraftDefaultsAuthoring } from "../../app-shell/toolcraft-defaults-authoring";
import { ToolcraftSourceAssetCoordinatorContext } from "../../app-shell/toolcraft-source-asset-context";
import { ToolcraftThemeContext } from "../../app-shell/theme-runtime";

export function SaveAppDefaults({ getState }: { getState: () => ToolcraftState }) {
  const authoring = useToolcraftDefaultsAuthoring();
  const coordinator = React.useContext(ToolcraftSourceAssetCoordinatorContext);
  const theme = React.useContext(ToolcraftThemeContext);
  const inFlight = React.useRef(false);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = React.useState<string | null>(null);
  if (!authoring) return null;
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus("saving");
    setError(null);
    try {
      const state = getState();
      if (state.mediaAssets.length && !coordinator?.captureDefaultResources) {
        throw new Error("Media defaults require the source asset owner.");
      }
      const uploads = coordinator?.captureDefaultResources
        ? await coordinator.captureDefaultResources(state.mediaAssets) : [];
      await authoring.save(createToolcraftAppDefaults(state, uploads.map(upload => upload.resource), theme?.themePreference), uploads);
      setStatus("saved");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save defaults. Please retry.");
      setStatus("idle");
    } finally { inFlight.current = false; }
  };
  return <>
    <PanelActions columns={1}>
      <Button type="button" variant="outline" loading={status === "saving"}
        aria-label={status === "saving" ? "Saving Defaults…" : undefined}
        onClick={() => { void save(); }}>
        Save State as Default
      </Button>
    </PanelActions>
    {error ? <FieldError role="alert">{error}</FieldError> : null}
    {status === "saved" ? <FieldDescription role="status">App defaults saved.</FieldDescription> : null}
  </>;
}
