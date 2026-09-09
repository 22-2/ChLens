import {
  cloneCommentOverlayGeometry,
  fitCommentOverlayGeometryToAspectRatio,
  fallbackCommentOverlayGeometry,
  loadStoredCommentOverlayGeometry,
  saveStoredCommentOverlayGeometry,
} from "./geometry";
import type {
  CommentOverlayGeometry,
  CommentOverlayMonitor,
  CommentOverlayWindowPlatform,
} from "./types";

const STORYBOOK_MONITORS: readonly CommentOverlayMonitor[] = [
  {
    id: "storybook-monitor",
    name: "Storybookモニター",
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    scaleFactor: 1,
  },
];

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
    async minimize() {},
    async toggleMaximize() {},
    async close() {},
    async watchVisibility(_listener: (visible: boolean) => void) {
      return () => {};
    },
    async getMonitors() {
      return STORYBOOK_MONITORS;
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
      if (!stored) return null;
      geometry = fitCommentOverlayGeometryToAspectRatio(stored);
      saveStoredCommentOverlayGeometry(geometry);
      return cloneCommentOverlayGeometry(geometry);
    },
    async saveGeometry(nextGeometry: CommentOverlayGeometry) {
      geometry = fitCommentOverlayGeometryToAspectRatio(nextGeometry);
      saveStoredCommentOverlayGeometry(geometry);
    },
  };
}
