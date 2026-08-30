export interface CommentOverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_COMMENT_OVERLAY_GEOMETRY: CommentOverlayGeometry = {
  x: 80,
  y: 80,
  width: 900,
  height: 240,
};

// 透明ウィンドウの当たり判定と表示中の操作バーで同じ高さを使うため、定数を一か所に置く。
export const COMMENT_OVERLAY_CONTROL_BAR_HEIGHT = 36;

export type CommentOverlayResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

export interface CommentOverlayWindowPlatform {
  show(): Promise<void>;
  hide(): Promise<void>;
  focus(): Promise<void>;
  startResizing(direction: CommentOverlayResizeDirection): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  setClickThrough(enabled: boolean): Promise<void>;
  watchVisibility(listener: (visible: boolean) => void): Promise<() => void>;
  trackBarHover(listener: (hovered: boolean) => void): () => void;
  getGeometry(): Promise<CommentOverlayGeometry | null>;
  watchGeometry(listener: (geometry: CommentOverlayGeometry) => void): Promise<() => void>;
  setGeometry(geometry: CommentOverlayGeometry): Promise<void>;
  loadGeometry(): Promise<CommentOverlayGeometry | null>;
  saveGeometry(geometry: CommentOverlayGeometry): Promise<void>;
}
