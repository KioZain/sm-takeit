import type { ToolcraftProductModuleDefinition } from "../modules/contract/module-definition";
import type {
  ToolcraftAppIdentitySchema,
  ToolcraftCanvasSchema,
  ToolcraftControlsPanelSchema,
  ToolcraftMediaSchema,
  ToolcraftSettingsTransferMode,
  ToolcraftSettingsTransferObjectSchema,
  ToolcraftToolbarSchema,
} from "./types";

export type ToolcraftProductPersistence =
  | Readonly<{ storage: "none" }>
  | Readonly<{
      additionalValueTargets?: readonly string[];
      storage?: "localStorage";
    }>;

export type ToolcraftProductSettingsTransfer =
  | ToolcraftSettingsTransferMode
  | Readonly<
      Omit<ToolcraftSettingsTransferObjectSchema, "appId"> & {
        appId?: never;
      }
    >;

export type ToolcraftProductBase = Readonly<{
  canvas: ToolcraftCanvasSchema;
  identity: ToolcraftAppIdentitySchema;
  media?: ToolcraftMediaSchema;
  panels: Readonly<{
    controls?: ToolcraftControlsPanelSchema;
  }>;
  persistence?: ToolcraftProductPersistence;
  settingsTransfer?: ToolcraftProductSettingsTransfer;
  toolbar?: ToolcraftToolbarSchema;
}>;

export type ToolcraftProductDefinition = Readonly<{
  base: ToolcraftProductBase;
  /** App-owned source snapshot saved through the local authoring panel. */
  defaults?: unknown;
  modules: readonly ToolcraftProductModuleDefinition[];
}>;
