"use client";

import * as React from "react";
import { SaveAppDefaults } from "./controls-panel-save-defaults";
import type { ToolcraftState } from "../../../state/types";

export type SettingsTransferControlRenderArgs = {
  getState: () => ToolcraftState;
  id: string;
};

export function renderSettingsTransferControl({
  getState,
  id,
}: SettingsTransferControlRenderArgs): React.ReactNode {
  return <SaveAppDefaults key={id} getState={getState} />;
}
