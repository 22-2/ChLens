import type { ViewerState } from "src/view/browser/utils/types";
import { toViewerImageUrl } from "src/view/browser/utils/utils";
import { create } from "zustand";

const MIN_VIEWER_SCALE = 0.25;
const MAX_VIEWER_SCALE = 5;
const TOOLBAR_ZOOM_STEP = 0.25;
const WHEEL_ZOOM_BASE = 1.5;

function normalizeWheelZoomDelta(deltaY: number, deltaMode = 0): number {
  if (deltaMode === 1) {
    return deltaY * 40;
  }
  if (deltaMode === 2) {
    return deltaY * 800;
  }
  return deltaY;
}

function clampViewerScale(scale: number): number {
  return Math.min(
    MAX_VIEWER_SCALE,
    Math.max(MIN_VIEWER_SCALE, +scale.toFixed(2)),
  );
}

interface MediaViewerStoreState {
  viewer: ViewerState | null;
  viewerScale: number;
  openMediaFromUrl: (url: string, resImages?: string[]) => void;
  closeViewer: () => void;
  navigateViewer: (delta: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetScale: () => void;
  zoomByWheel: (deltaY: number, deltaMode?: number) => void;
}

export const useMediaViewerStore = create<MediaViewerStoreState>(
  (set, get) => ({
    viewer: null,
    viewerScale: 1,

    openMediaFromUrl: (url, resImages) => {
      const imageUrl = toViewerImageUrl(url);
      if (!imageUrl) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      const images = resImages && resImages.length > 1 ? resImages : undefined;
      const currentIndex = images
        ? Math.max(0, images.indexOf(url))
        : undefined;

      set({
        viewer: {
          src: imageUrl,
          label: url,
          images,
          currentIndex,
        },
        // 画像を切り替えた時に前回のズーム倍率を引き継ぐと初見画像の全体把握が難しいため、毎回等倍に戻す。
        viewerScale: 1,
      });
    },

    closeViewer: () => {
      set({ viewer: null });
    },

    navigateViewer: (delta) => {
      const { viewer } = get();
      if (!viewer?.images) {
        return;
      }

      const length = viewer.images.length;
      const currentIndex = viewer.currentIndex ?? 0;
      // 先頭/末尾で循環させると前後関係を見失いやすいため、端で停止させる。
      const nextIndex = Math.min(length - 1, Math.max(0, currentIndex + delta));
      if (nextIndex === currentIndex) {
        return;
      }

      const rawUrl = viewer.images[nextIndex];
      const nextSrc = toViewerImageUrl(rawUrl) ?? rawUrl;

      set({
        viewer: {
          ...viewer,
          src: nextSrc,
          label: rawUrl,
          currentIndex: nextIndex,
        },
        viewerScale: 1,
      });
    },

    zoomIn: () => {
      set((state) => ({
        viewerScale: clampViewerScale(state.viewerScale + TOOLBAR_ZOOM_STEP),
      }));
    },

    zoomOut: () => {
      set((state) => ({
        viewerScale: clampViewerScale(state.viewerScale - TOOLBAR_ZOOM_STEP),
      }));
    },

    resetScale: () => {
      set({ viewerScale: 1 });
    },

    zoomByWheel: (deltaY, deltaMode = 0) => {
      set((state) => {
        // trackpad / マウスホイール差を吸収しつつ Pixi 風の倍率ズームへ寄せる。
        const normalizedDelta = normalizeWheelZoomDelta(deltaY, deltaMode);
        const nextScale =
          state.viewerScale * Math.pow(WHEEL_ZOOM_BASE, -normalizedDelta / 120);
        return { viewerScale: clampViewerScale(nextScale) };
      });
    },
  }),
);
