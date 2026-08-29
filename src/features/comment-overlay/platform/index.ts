import { createBrowserCommentOverlayPlatform } from "./browser";
import { createTauriCommentOverlayPlatform } from "./tauri";
import { isTauriRuntime } from "src/app/platform/runtime";

export function createCommentOverlayWindowPlatform() {
  return isTauriRuntime()
    ? createTauriCommentOverlayPlatform()
    : createBrowserCommentOverlayPlatform();
}

export const commentOverlayWindowPlatform = createCommentOverlayWindowPlatform();

export {
  createCommentOverlayEventBus,
  COMMENT_OVERLAY_EVENT_NAME,
  TauriCommentOverlayEventBus,
} from "./events";
export { DEFAULT_COMMENT_OVERLAY_GEOMETRY, COMMENT_OVERLAY_CONTROL_BAR_HEIGHT } from "./types";
export type { CommentOverlayEvent, CommentOverlayEventBus } from "../domain";
export type {
  CommentOverlayGeometry,
  CommentOverlayResizeDirection,
  CommentOverlayWindowPlatform,
} from "./types";
