import { isTauriRuntime } from "src/app/platform/runtime";

import { createBrowserCommentOverlayPlatform } from "./browser";
import { createTauriCommentOverlayPlatform } from "./tauri";

export function createCommentOverlayWindowPlatform() {
  return isTauriRuntime()
    ? createTauriCommentOverlayPlatform()
    : createBrowserCommentOverlayPlatform();
}

export const commentOverlayWindowPlatform = createCommentOverlayWindowPlatform();

export type { CommentOverlayEvent, CommentOverlayEventBus } from "../domain";
export {
  COMMENT_OVERLAY_EVENT_NAME,
  createCommentOverlayEventBus,
  TauriCommentOverlayEventBus,
} from "./events";
export { fitCommentOverlayGeometryToAspectRatio } from "./geometry";
export { COMMENT_OVERLAY_VISIBILITY_EVENT_NAME } from "./tauri";
export type {
  CommentOverlayGeometry,
  CommentOverlayMonitor,
  CommentOverlayWindowPlatform,
} from "./types";
export { COMMENT_OVERLAY_ASPECT_RATIO, DEFAULT_COMMENT_OVERLAY_GEOMETRY } from "./types";
