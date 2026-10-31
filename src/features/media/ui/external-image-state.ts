import type { MediaImageStatus } from "../browser/use-media-image-store";

/**
 * 外部画像の表示判断を、DOM・ストア・通信に触れない純粋な関数として切り出したもの。
 * ExternalImage はこの判断結果に従って、実際の取得・表示・ログ出力だけを行う。
 */

export type FallbackStatus = "idle" | "pending" | "loaded" | "failed";

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export type PreflightDecision = "none" | "allow-within-limit" | "request-now" | "wait-for-visible";

export interface PreflightInput {
  /** 手動取得の設定、または親からの指定で、自動では取得しない。 */
  manualLoad: boolean;
  status: MediaImageStatus | undefined;
  /** `loading="lazy"` の画像は、表示領域へ近づいてからサイズを確認する。 */
  lazy: boolean;
  canObserveVisibility: boolean;
}

/** 取得前の画像に対して、サイズ確認をいつ・どうするかを決める。 */
export function decidePreflight({
  manualLoad,
  status,
  lazy,
  canObserveVisibility,
}: PreflightInput): PreflightDecision {
  if (manualLoad || status === "discarded") return "none";
  if (status === "awaiting-confirmation") return "allow-within-limit";
  if (status === "checking" || status === "requested" || status === "loaded") return "none";
  // 変更理由: `loading="lazy"` の画像をすべて先にHEAD確認すると、画面外にも通信が増える。
  return lazy && canObserveVisibility ? "wait-for-visible" : "request-now";
}

export interface ImageErrorInput {
  /** エラーになった img の src 属性。フォールバックへの切替で外した場合は null になる。 */
  currentSrcAttr: string | null;
  /** エラーの時点で、表示中のURLがこの画像の元のURLと一致しているか。 */
  isCurrentSource: boolean;
  fallbackStatus: FallbackStatus;
  isTauri: boolean;
  isHttp: boolean;
  /** ストアに保存済みのフォールバック画像そのものが失敗したか。 */
  failedCachedFallback: boolean;
}

export type ImageErrorDecision =
  | { action: "ignore" }
  | { action: "fallback" }
  | { action: "fail"; reportCachedFailure: boolean };

/**
 * 画像の読み込み失敗を、無視・Tauriの取得への切替・失敗の確定のどれにするかを決める。
 * 属性を外したことによるエラーは読込失敗ではないため無視する。
 */
export function decideImageError({
  currentSrcAttr,
  isCurrentSource,
  fallbackStatus,
  isTauri,
  isHttp,
  failedCachedFallback,
}: ImageErrorInput): ImageErrorDecision {
  if (!currentSrcAttr || !isCurrentSource) return { action: "ignore" };
  if (fallbackStatus === "pending" || fallbackStatus === "failed") return { action: "ignore" };

  const hasLoadedFallback = fallbackStatus === "loaded";
  if (!isTauri || !isHttp || hasLoadedFallback || failedCachedFallback) {
    return { action: "fail", reportCachedFailure: hasLoadedFallback || failedCachedFallback };
  }
  return { action: "fallback" };
}

export interface ImageRequestSnapshot {
  src: string;
  componentRequestVersion: number;
  imageRequestVersion: number;
}

export interface CurrentImageRequest {
  src: string;
  componentRequestVersion: number;
  /** ストアに保存された画像の版。取得の状態が切り替わると変わる。 */
  imageVersion: number;
}

/** 非同期の取得が終わった時点で、その結果をまだ使ってよいかを判定する。 */
export function isStaleImageRequest(
  request: ImageRequestSnapshot,
  current: CurrentImageRequest,
): boolean {
  return (
    current.src !== request.src ||
    current.componentRequestVersion !== request.componentRequestVersion ||
    current.imageVersion !== request.imageRequestVersion
  );
}

export interface RenderedSrcInput {
  fallbackSrc: string | null | undefined;
  isCurrentSource: boolean;
  renderedSrc: string | null;
}

/** img に設定する src を決める。取得済みのフォールバックを、元のURLより優先する。 */
export function resolveRenderedSrc({
  fallbackSrc,
  isCurrentSource,
  renderedSrc,
}: RenderedSrcInput): string | null {
  return fallbackSrc ?? (isCurrentSource ? renderedSrc : null);
}

export interface MarkLoadedInput {
  renderedSrc: string | null;
  isCurrentSource: boolean;
  /** 読み込み完了イベントの時点の、img の src 属性。 */
  eventSrcAttr: string | null;
}

/** 読み込み完了が、現在表示しようとしている画像のものかどうか。 */
export function shouldMarkImageLoaded({
  renderedSrc,
  isCurrentSource,
  eventSrcAttr,
}: MarkLoadedInput): boolean {
  return renderedSrc !== null && isCurrentSource && eventSrcAttr === renderedSrc;
}

export interface PlaceholderTextInput {
  status: MediaImageStatus | undefined;
  contentLength: number | null | undefined;
  maxBytes: number | undefined;
  manualLoad: boolean;
}

/** 取得前・確認中・削除済みの画像の枠に出す文言。 */
export function getExternalImagePlaceholderText({
  status,
  contentLength,
  maxBytes,
  manualLoad,
}: PlaceholderTextInput): string {
  if (status === "discarded") return "削除されました";
  if (status === "checking") return "画像サイズを確認中...";
  if (status === "awaiting-confirmation") {
    if (contentLength == null) return "画像サイズを確認できません。クリックして確認";
    const imageSizeMb = (contentLength / 1_000_000).toFixed(2);
    const maxSizeMb = ((maxBytes ?? 0) / 1_000_000).toFixed(2);
    return `${imageSizeMb} MBの画像（上限 ${maxSizeMb} MB）。クリックして確認`;
  }
  return manualLoad ? "クリックして画像を取得" : "画像サイズを確認中...";
}
