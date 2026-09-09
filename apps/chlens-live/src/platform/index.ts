import { createBrowserLiveWindowPlatform } from "./browser";
import { createTauriLiveWindowPlatform } from "./tauri";
import type { LiveWindowPlatform } from "./types";

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createLiveWindowPlatform(): LiveWindowPlatform {
  return isTauriRuntime() ? createTauriLiveWindowPlatform() : createBrowserLiveWindowPlatform();
}

export const liveWindowPlatform = createLiveWindowPlatform();

export { constrainOverlayGeometryToAspectRatio, fitOverlayGeometryToAspectRatio } from "./geometry";
export {
  DEFAULT_OVERLAY_GEOMETRY,
  OVERLAY_ASPECT_RATIO,
  OVERLAY_CONTROL_BAR_HEIGHT,
} from "./types";
export type { LiveWindowPlatform, OverlayGeometry, OverlayResizeDirection } from "./types";
