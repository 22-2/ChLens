import MessageProcessor from "src/core/MessageProcessor";
import { URL_LIKE_PATTERN, normalizeObfuscatedUrl } from "@chlen/ch-lib";
import { parseReplyAnchorTargets } from "src/core/reply-index";
import type { IRes } from "src/service-container";
import { isInlineVideoEmbedUrl } from "src/view/browser/utils/external-media";

const decodeEntitySpan = typeof document !== "undefined" ? document.createElement("span") : null;

function decodeCharReferences(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g,
    (matched, decimal, hexadecimal, namedEntity) => {
      if (decimal != null) {
        return String.fromCodePoint(Number(decimal));
      }
      if (hexadecimal != null) {
        return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
      }
      if (namedEntity != null && decodeEntitySpan) {
        decodeEntitySpan.innerHTML = matched;
        return decodeEntitySpan.textContent ?? matched;
      }
      return matched;
    },
  );
}

// --- アンカーパーサ ---
// MessageProcessor由来のHTML内のアンカー（>>N）から参照先レス番号を抽出する
export const parseAnchors = parseReplyAnchorTargets;
// HTMLからテキストを抽出（検索フィルタ・コピー用）
// <br> は改行に変換してからタグを除去することで、コピー時に改行が反映されるようにする
export function stripHtml(html: string): string {
  // レス本文には数値文字参照の絵文字が混ざることがあるため、
  // タグ除去後に既存の文字参照デコーダーへ通してコピー/検索時の文字化けを防ぐ。
  return decodeCharReferences(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""));
}

export function normalizeIdLinkText(text: string): string {
  return text
    .trim()
    .replace(/^id:/i, "ID:")
    .replace(/\(\d+\)$/, "")
    .replace(/\u25cf$/, "");
}

export function formatIdForCopy(id: string | undefined): string {
  const normalizedId = id?.trim().replace(/^ID:/i, "").trim() ?? "";
  return normalizedId ? `ID:${normalizedId}` : "";
}

export function formatResForCopy(res: IRes): string {
  const plainName = stripHtml(res.name);
  // 投稿データ由来の先頭スペースだけを除去し、本文内の意図的なインデントは保持する。
  const plainMessage = stripHtml(res.message).replace(/^ /, "");
  const formattedId = formatIdForCopy(res.id);
  const idSuffix = formattedId ? ` ${formattedId}` : "";
  return `${res.num} ${plainName}${idSuffix}  ${res.date ?? res.other ?? ""}\n${plainMessage}`;
}

export function buildKyodemoUrl(threadUrl: string, rawId: string): string | null {
  try {
    const urlObj = new window.URL(threadUrl);
    const pathParts = urlObj.pathname.split("/");
    const board = pathParts[3];
    const key = pathParts[4];
    if (!board || !key) return null;

    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}${mm}${dd}`;

    return `https://www.kyodemo.net/sdemo/b/e_e_${board}/?hi=${encodeURIComponent(
      rawId,
    )}&key=${encodeURIComponent(key)}&date=${dateStr}`;
  } catch {
    return null;
  }
}
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard APIが使えない環境向けフォールバック
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

export function canCopyImageToClipboard(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.write === "function" &&
    typeof globalThis.ClipboardItem !== "undefined"
  );
}

export async function copyImageBlob(blob: Blob): Promise<void> {
  if (!canCopyImageToClipboard()) {
    throw new Error("Image clipboard API is not available");
  }

  // 画像コピーはテキストのような安全なフォールバックがないため、
  // 対応ブラウザだけで明示的に ClipboardItem を使う。
  await navigator.clipboard.write([
    new globalThis.ClipboardItem({
      [blob.type]: blob,
    }),
  ]);
}
// --- フィルタ判定 ---
export function hasImage(message: string): boolean {
  const normalizedMessage = message.replace(URL_LIKE_PATTERN, normalizeObfuscatedUrl);
  return (
    /\.(jpe?g|png|gif|webp|bmp|avif)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(normalizedMessage) ||
    /https?:\/\/pbs\.twimg\.com\/media\/[^\s"'<>?]+\?[^\s"'<>]*format=(?:jpe?g|png|gif|webp|bmp|avif)\b/i.test(
      normalizedMessage,
    )
  );
}
export function hasVideo(message: string): boolean {
  const normalizedMessage = message.replace(URL_LIKE_PATTERN, normalizeObfuscatedUrl);
  return (
    /\.(mp4|webm|avi|mov)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(normalizedMessage) ||
    /<video\b/i.test(normalizedMessage) ||
    (normalizedMessage
      .match(/https?:\/\/[^\s"'<>]+/gi)
      ?.some((url) => isInlineVideoEmbedUrl(url)) ??
      false)
  );
}
export function hasExternalLink(message: string): boolean {
  // res.message はレンダリング前の生HTMLで、通常URLはまだ <a> タグ化されていない
  // （linkify は MessageProcessor が描画時に行う）ため、<a href> だけを見ると常に不一致になる。
  // 生テキスト中の http(s) URL と、先頭を削った URL も対象にする。
  return new RegExp(URL_LIKE_PATTERN.source, "i").test(message);
}

export function parseAnchorDisplayTargets(text: string): number[] {
  const raw = text.replace(/&gt;/g, ">").replace(/[＞]/g, ">").replace(/^>+/, "").trim();
  if (!raw) return [];

  const result = new Set<number>();
  const parts = raw.split(/\s*[,、]\s*/);
  for (const part of parts) {
    const range = part
      .replace(/[\uff10-\uff19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30))
      .split(/[-\u30fc]/);
    const start = parseInt(range[0], 10);
    const end = range.length > 1 ? parseInt(range[1], 10) : start;
    if (Number.isNaN(start) || Number.isNaN(end) || end - start >= 25) {
      continue;
    }
    for (let i = start; i <= end; i++) {
      result.add(i);
    }
  }
  return Array.from(result).sort((a, b) => a - b);
}
interface DecodedMessageParts {
  nameHtml: string;
  mailHtml: string;
  otherHtml: string;
  messageHtml: string;
  isNameAnchor: boolean;
}

export function decodeResponseHtml(res: IRes, protocol: string): DecodedMessageParts {
  // React版でも旧ビューと同じHTML化を通しておかないと、>>アンカーが文字列のまま残ってホバー対象を拾えない。
  return MessageProcessor.decode(res, protocol) as DecodedMessageParts;
}
export type GestureDirection = "Up" | "Down";
export interface GesturePoint {
  x: number;
  y: number;
}
export const GESTURE_START_THRESHOLD = 12;
export const GESTURE_CONTEXTMENU_SUPPRESS_MS = 400;
export function summarizeVerticalGesture(
  points: GesturePoint[],
): { direction: GestureDirection; distance: number } | null {
  if (points.length < 2) {
    return null;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const totalDx = end.x - start.x;
  const totalDy = end.y - start.y;
  const distance = Math.hypot(totalDx, totalDy);

  if (distance < 10) {
    return null;
  }

  if (Math.abs(totalDy) <= Math.abs(totalDx)) {
    return null;
  }

  return {
    direction: totalDy < 0 ? "Up" : "Down",
    distance,
  };
}

export function extractUrlsFromMessage(message: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUrl = (url: string) => {
    const trimmed = normalizeObfuscatedUrl(url.trim().replace(/[),.;]+$/, ""));
    if (!/^https?:\/\//i.test(trimmed)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  };

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(message, "text/html");
    for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
      pushUrl(a.getAttribute("href") ?? "");
    }
  } catch {
    // HTMLパースに失敗した場合でも正規表現抽出で継続
  }

  const textMatch = message.match(URL_LIKE_PATTERN) ?? [];
  for (const url of textMatch) {
    pushUrl(url);
  }

  return result;
}

/**
 * imgurのリサイズパラメータ付きサムネイルURLから、オリジナル解像度のURLを返す。
 * リサイズパラメータ（m など）が付いていない場合は null を返す。
 */
export function toOriginalImageUrl(thumbnailUrl: string): string | null {
  try {
    const url = new window.URL(thumbnailUrl);
    if (url.hostname.toLowerCase() !== "i.imgur.com") return null;
    // /[id]m.jpg のパターンからリサイズパラメータを除去してオリジナルURLを生成
    const match = url.pathname.match(/^\/([a-z0-9]+)m\.([a-z]+)$/i);
    if (!match) return null;
    const [, id, ext] = match;
    return `https://i.imgur.com/${id}.${ext}`;
  } catch {
    return null;
  }
}

/**
 * 生のURLを、メディアビューアで表示可能な画像URLに変換する。
 *
 * Imgurについては、読み込み速度向上のためリサイズパラメータ(m: 320px)を付与してサムネイルURLに変換する。
 * - シングル画像: imgur.com/[id] や imgur.com/[id]/ → i.imgur.com/[id]m.jpg
 * - アルバム: imgur.com/a/[album_id] は変換しない（画像URLではないため対象外）
 * - 既に拡張子付きのi.imgur画像: i.imgur.com/[id].jpg → i.imgur.com/[id]m.jpg （リサイズパラメータ追加）
 */
export function toViewerImageUrl(rawUrl: string): string | null {
  try {
    const url = new window.URL(normalizeObfuscatedUrl(rawUrl));
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    // imgur URL の処理を最初に行う（他の拡張子チェックより優先）
    if (host === "i.imgur.com") {
      // i.imgur.comの既存画像URLについて、リサイズパラメータを追加してサムネイルを高速化
      // 形式: https://i.imgur.com/[id].jpg → https://i.imgur.com/[id]m.jpg
      const match = pathname.match(/^\/([a-z0-9]+)\.([a-z]+)$/i);
      if (match) {
        const [, id, ext] = match;
        return `https://i.imgur.com/${id}m.${ext}`;
      }
      return url.href;
    }

    if (host === "imgur.com" || host === "m.imgur.com") {
      const parts = pathname.split("/").filter(Boolean);

      // imgur.com/[id] または imgur.com/[id]/ の形式（シングル画像）
      if (parts.length === 1) {
        const id = parts[0].split(".")[0];
        if (id) {
          // リサイズパラメータ(m: Medium Thumbnail 320px)を追加して高速化
          return `https://i.imgur.com/${id}m.jpg`;
        }
      }

      // imgur.com/a/[album_id] の形式（アルバム）
      if (parts.length === 2 && parts[0].toLowerCase() === "a") {
        // アルバムURLはHTMLコンテナであり画像直接リンクではない。
        // 変換すると誤表示や誤解決を招くため、サムネイル対象から除外する。
        return null;
      }
    }

    if (/\.(jpe?g|png|gif|webp|bmp|avif)(\?.*)?$/i.test(pathname)) {
      return url.href;
    }

    if (
      host === "pbs.twimg.com" &&
      pathname.startsWith("/media/") &&
      /^(jpe?g|png|gif|webp|bmp|avif)$/i.test(url.searchParams.get("format") ?? "")
    ) {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}
