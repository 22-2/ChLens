import type { CommentOverlayMonitor } from "src/features/comment-overlay/platform";

export interface OverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** EdgeLiveViewerのリサイズ既定値と同じ16:9を、native windowと表示倍率で共有する。 */
export const OVERLAY_ASPECT_RATIO = 16 / 9;

export const DEFAULT_OVERLAY_GEOMETRY: OverlayGeometry = {
  x: 80,
  y: 80,
  width: 900,
  height: 506,
};

export interface LiveWindowPlatform {
  showOverlay(): Promise<void>;
  hideOverlay(): Promise<void>;
  focusOverlay(): Promise<void>;
  minimizeOverlay(): Promise<void>;
  toggleMaximizeOverlay(): Promise<void>;
  closeOverlay(): Promise<void>;
  getOverlayMonitors(): Promise<readonly CommentOverlayMonitor[]>;
  getOverlayGeometry(): Promise<OverlayGeometry | null>;
  watchOverlayGeometry(listener: (geometry: OverlayGeometry) => void): Promise<() => void>;
  setOverlayGeometry(geometry: OverlayGeometry): Promise<void>;
  loadOverlayGeometry(): Promise<OverlayGeometry | null>;
  saveOverlayGeometry(geometry: OverlayGeometry): Promise<void>;
}
