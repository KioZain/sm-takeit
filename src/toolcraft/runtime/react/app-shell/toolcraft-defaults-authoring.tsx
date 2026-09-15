"use client";
import * as React from "react";
import type { ToolcraftAppDefaults } from "../../schema/app-defaults";
import type { ToolcraftDefaultResourceUpload } from "../../source-assets/default-resource-capture";

export type ToolcraftDefaultsAuthoring = Readonly<{
  save: (defaults: ToolcraftAppDefaults, resources?: readonly ToolcraftDefaultResourceUpload[]) => Promise<void>;
}>;
const Context = React.createContext<ToolcraftDefaultsAuthoring | null>(null);
export const ToolcraftDefaultsAuthoringProvider = Context.Provider;
export function useToolcraftDefaultsAuthoring(): ToolcraftDefaultsAuthoring | null {
  return React.useContext(Context);
}
