import {
  cloneCommentOverlayGeometry,
  fallbackCommentOverlayGeometry,
  loadStoredCommentOverlayGeometry,
  saveStoredCommentOverlayGeometry,
} from "./geometry";
import type {
  CommentOverlayGeometry,
  CommentOverlayResizeDirection,
  CommentOverlayWindowPlatform,
} from "./types";

/**
 * StorybookとBrowser版ではnative windowを操作しないため、同じ非同期契約だけを提供する。
 * Browser版から誤ってOverlayを生成しないことを明示する境界にもなる。
 */
export function createBrowserCommentOverlayPlatform(): CommentOverlayWindowPlatform {
  let geometry = fallbackCommentOverlayGeometry(loadStoredCommentOverlayGeometry());

  return {
    async show() {},
    async hide() {},
    async focus() {},
    async startResizing(_direction: CommentOverlayResizeDirection) {},
    async minimize() {},
    async toggleMaximize() {},
    async close() {},
    async setClickThrough(_enabled: boolean) {},
    trackBarHover(_listener: (hovered: boolean) => void) {
      return () => {};
    },
    async getGeometry() {
      return cloneCommentOverlayGeometry(geometry);
    },
    async watchGeometry(_listener: (nextGeometry: CommentOverlayGeometry) => void) {
      return () => {};
    },
    async setGeometry(nextGeometry: CommentOverlayGeometry) {
      geometry = fallbackCommentOverlayGeometry(nextGeometry);
    },
    async loadGeometry() {
      const stored = loadStoredCommentOverlayGeometry();
      if (stored) geometry = stored;
      return stored ? cloneCommentOverlayGeometry(stored) : null;
    },
    async saveGeometry(nextGeometry: CommentOverlayGeometry) {
      geometry = fallbackCommentOverlayGeometry(nextGeometry);
      saveStoredCommentOverlayGeometry(geometry);
    },
  };
}
