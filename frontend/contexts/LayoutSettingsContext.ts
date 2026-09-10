import { createContext, useContext } from "react";
import type { LayoutSettings } from "#root/shared/types/layout-settings";
import { DEFAULT_LAYOUT_SETTINGS } from "#root/shared/types/layout-settings";

export const LayoutSettingsContext = createContext<LayoutSettings>(
  DEFAULT_LAYOUT_SETTINGS,
);

export function useLayoutSettings(): LayoutSettings {
  return useContext(LayoutSettingsContext);
}
