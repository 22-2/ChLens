export interface OverlayGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_OVERLAY_GEOMETRY: OverlayGeometry = {
  x: 80,
  y: 80,
  width: 900,
  height: 160,
};

// The control bar is intentionally a compact Windows-style title strip. Keep its native hit-test
// height in one shared place so cursor passthrough matches the rendered bar before it receives an event.
export const OVERLAY_CONTROL_BAR_HEIGHT = 36;

export type OverlayResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

export interface LiveWindowPlatform {
  showOverlay(): Promise<void>;
  hideOverlay(): Promise<void>;
  focusOverlay(): Promise<void>;
  startDraggingOverlay(): Promise<void>;
  startResizingOverlay(direction: OverlayResizeDirection): Promise<void>;
  minimizeOverlay(): Promise<void>;
  toggleMaximizeOverlay(): Promise<void>;
  closeOverlay(): Promise<void>;
  setOverlayClickThrough(enabled: boolean): Promise<void>;
  getOverlayGeometry(): Promise<OverlayGeometry | null>;
  setOverlayGeometry(geometry: OverlayGeometry): Promise<void>;
  loadOverlayGeometry(): Promise<OverlayGeometry | null>;
  saveOverlayGeometry(geometry: OverlayGeometry): Promise<void>;
}
