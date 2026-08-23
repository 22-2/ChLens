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

// The control bar occupies the top of the transparent overlay. Keep its native hit-test height in
// one shared place so cursor passthrough can be toggled before the bar receives a pointer event.
export const OVERLAY_CONTROL_BAR_HEIGHT = 64;

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
