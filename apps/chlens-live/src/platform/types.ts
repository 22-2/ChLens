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

export interface LiveWindowPlatform {
  showOverlay(): Promise<void>;
  hideOverlay(): Promise<void>;
  focusOverlay(): Promise<void>;
  getOverlayGeometry(): Promise<OverlayGeometry | null>;
  setOverlayGeometry(geometry: OverlayGeometry): Promise<void>;
  loadOverlayGeometry(): Promise<OverlayGeometry | null>;
  saveOverlayGeometry(geometry: OverlayGeometry): Promise<void>;
}
