// upstreamに型定義がないため、Liveのタブ切り替えで利用する公開APIだけを宣言する。
declare module "normalize-wheel" {
  interface NormalizedWheel {
    spinX: number;
    spinY: number;
    pixelX: number;
    pixelY: number;
  }

  interface NormalizeWheel {
    (event: WheelEvent): NormalizedWheel;
    getEventType(): string;
  }

  const normalizeWheel: NormalizeWheel;
  export default normalizeWheel;
}
