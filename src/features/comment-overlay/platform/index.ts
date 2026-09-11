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
export { COMMENT_OVERLAY_VISIBILITY_EVENT_NAME } from "./tauri";
export { fitCommentOverlayGeometryToAspectRatio } from "./geometry";
export { COMMENT_OVERLAY_ASPECT_RATIO, DEFAULT_COMMENT_OVERLAY_GEOMETRY } from "./types";
export type { CommentOverlayEvent, CommentOverlayEventBus } from "../domain";
export type {
  CommentOverlayGeometry,
  CommentOverlayMonitor,
  CommentOverlayWindowPlatform,
} from "./types";
