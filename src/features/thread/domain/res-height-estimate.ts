import { stripHtml } from "src/core/util/strip-html";

/**
 * 描画する前のレスの高さを、本文の文字数と改行から見積もる。
 *
 * 仮想スクロールでは、まだ描画していないレスの高さが全体の高さとジャンプ先の位置を決める。
 * 見積もりが外れても表示はアンカーで補正されるが、外れが小さいほどスクロールバーの動きと
 * 遠いレスへのジャンプの着地点が安定する。実測できるようになれば実測値を使う。
 */
export interface ResHeightMetrics {
  /** 本文の行の高さ。 */
  lineHeight: number;
  /** 本文の文字の大きさ。全角文字の幅とみなす。 */
  fontSize: number;
  /** 本文が使える幅。 */
  contentWidth: number;
  /** 本文以外の高さ（ヘッダ行と上下の余白）。 */
  chromeHeight: number;
  /** 画像サムネイル1行分の高さ。 */
  mediaRowHeight: number;
  /** サムネイルを1行に並べる数。 */
  mediaColumns: number;
}

export const DEFAULT_RES_HEIGHT_METRICS: ResHeightMetrics = {
  lineHeight: 24,
  fontSize: 15,
  contentWidth: 800,
  chromeHeight: 36,
  mediaRowHeight: 124,
  mediaColumns: 3,
};

export interface EstimatableRes {
  message: string;
}

/** 半角文字の幅を全角の何倍とみなすか。等幅でないフォントのおおよその平均。 */
const NARROW_CHARACTER_RATIO = 0.55;
const LINE_BREAK_PATTERN = /<br\s*\/?>/iu;
const IMAGE_URL_PATTERN =
  /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|gif|webp|avif)(?:[?#][^\s"'<>]*)?/giu;

export function estimateResHeight(res: EstimatableRes, metrics: ResHeightMetrics): number {
  const textLines = countWrappedLines(res.message, metrics);
  const mediaCount = res.message.match(IMAGE_URL_PATTERN)?.length ?? 0;
  const mediaRows = Math.ceil(mediaCount / Math.max(1, metrics.mediaColumns));
  return Math.round(
    metrics.chromeHeight + textLines * metrics.lineHeight + mediaRows * metrics.mediaRowHeight,
  );
}

function countWrappedLines(messageHtml: string, metrics: ResHeightMetrics): number {
  const width = Math.max(metrics.fontSize, metrics.contentWidth);
  let lines = 0;
  for (const line of messageHtml.split(LINE_BREAK_PATTERN)) {
    const lineWidth = measureTextWidth(stripHtml(line), metrics.fontSize);
    lines += Math.max(1, Math.ceil(lineWidth / width));
  }
  return lines;
}

function measureTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const character of text) {
    width += character.codePointAt(0)! > 0xff ? fontSize : fontSize * NARROW_CHARACTER_RATIO;
  }
  return width;
}
