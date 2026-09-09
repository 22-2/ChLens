export interface CommentOverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** EdgeLiveViewerのリサイズ既定値と同じ16:9を、native windowと表示倍率で共有する。 */
export const COMMENT_OVERLAY_ASPECT_RATIO = 16 / 9;

export const DEFAULT_COMMENT_OVERLAY_GEOMETRY: CommentOverlayGeometry = {
  x: 80,
  y: 80,
  width: 900,
  height: 506,
};

/** 仮想デスクトップ上でOverlayの配置先を表示するためのモニター情報。 */
export interface CommentOverlayMonitor {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface CommentOverlayWindowPlatform {
  show(): Promise<void>;
  hide(): Promise<void>;
  focus(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  watchVisibility(listener: (visible: boolean) => void): Promise<() => void>;
  getMonitors(): Promise<readonly CommentOverlayMonitor[]>;
  getGeometry(): Promise<CommentOverlayGeometry | null>;
  watchGeometry(listener: (geometry: CommentOverlayGeometry) => void): Promise<() => void>;
  setGeometry(geometry: CommentOverlayGeometry): Promise<void>;
  loadGeometry(): Promise<CommentOverlayGeometry | null>;
  saveGeometry(geometry: CommentOverlayGeometry): Promise<void>;
}
