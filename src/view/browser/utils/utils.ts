import MessageProcessor from "src/core/MessageProcessor";
import type { IRes } from "src/service-container";

const decodeEntitySpan =
  typeof document !== "undefined" ? document.createElement("span") : null;

function decodeCharReferences(text: string): string {
  return text.replace(
    /\&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g,
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
const ANCHOR_REG =
  /(?:&gt;|＞){1,2}([\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*)/g;
const FW_NUM_REG = /[\uff10-\uff19]/g;
export function parseAnchors(message: string): number[] {
  const targets: number[] = [];
  ANCHOR_REG.lastIndex = 0;
  let match;
  while ((match = ANCHOR_REG.exec(message)) !== null) {
    const raw = match[1].replace(FW_NUM_REG, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    );
    const parts = raw.split(/\s*[,、]\s*/);
    for (const part of parts) {
      const range = part.split(/[\-\u30fc]/);
      const start = parseInt(range[0], 10);
      const end = range.length > 1 ? parseInt(range[1], 10) : start;
      // 25件以上の範囲指定は無視（既存動作に合わせる）
      if (isNaN(start) || isNaN(end) || end - start >= 25) continue;
      for (let i = start; i <= end; i++) {
        targets.push(i);
      }
    }
  }
  return targets;
}
// HTMLからテキストを抽出（検索フィルタ・コピー用）
// <br> は改行に変換してからタグを除去することで、コピー時に改行が反映されるようにする
export function stripHtml(html: string): string {
  // レス本文には数値文字参照の絵文字が混ざることがあるため、
  // タグ除去後に既存の文字参照デコーダーへ通してコピー/検索時の文字化けを防ぐ。
  return decodeCharReferences(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""),
  );
}

export function normalizeIdLinkText(text: string): string {
  return text
    .trim()
    .replace(/^id:/i, "ID:")
    .replace(/\(\d+\)$/, "")
    .replace(/\u25cf$/, "");
}
export function buildKyodemoUrl(
  threadUrl: string,
  rawId: string,
): string | null {
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

    return `https://www.kyodemo.net/sdemo/b/e_e_${board}/?hi=${encodeURIComponent(rawId)}&key=${encodeURIComponent(key)}&date=${dateStr}`;
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
// --- フィルタ判定 ---
export function hasImage(message: string): boolean {
  return (
    /\.(jpe?g|png|gif|webp|bmp|avif)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(message) ||
    /https?:\/\/pbs\.twimg\.com\/media\/[^\s"'<>?]+\?[^\s"'<>]*format=(?:jpe?g|png|gif|webp|bmp|avif)\b/i.test(
      message,
    )
  );
}
export function hasVideo(message: string): boolean {
  return (
    /\.(mp4|webm|avi|mov)(?:\?[^"<]*)?(?=["<\s]|$)/i.test(message) ||
    /<video\b/i.test(message)
  );
}
export function hasExternalLink(message: string): boolean {
  return /<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/i.test(message);
}

export function parseAnchorDisplayTargets(text: string): number[] {
  const raw = text
    .replace(/&gt;/g, ">")
    .replace(/[＞]/g, ">")
    .replace(/^>+/, "")
    .trim();
  if (!raw) return [];

  const result = new Set<number>();
  const parts = raw.split(/\s*[,、]\s*/);
  for (const part of parts) {
    const range = part
      .replace(FW_NUM_REG, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
      )
      .split(/[\-\u30fc]/);
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

export function decodeResponseHtml(
  res: IRes,
  protocol: string,
): DecodedMessageParts {
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
    const trimmed = url.trim().replace(/[),.;]+$/, "");
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

  const textMatch = message.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  for (const url of textMatch) {
    pushUrl(url);
  }

  return result;
}

export function toViewerImageUrl(rawUrl: string): string | null {
  try {
    const url = new window.URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname;

    if (/\.(jpe?g|png|gif|webp|bmp|avif)(\?.*)?$/i.test(pathname)) {
      return url.href;
    }

    if (host === "i.imgur.com") {
      return url.href;
    }

    if (
      host === "pbs.twimg.com" &&
      pathname.startsWith("/media/") &&
      /^(jpe?g|png|gif|webp|bmp|avif)$/i.test(
        url.searchParams.get("format") ?? "",
      )
    ) {
      return url.href;
    }

    if (host === "imgur.com" || host === "m.imgur.com") {
      const parts = pathname.split("/").filter(Boolean);
      if (parts.length === 1) {
        const id = parts[0].split(".")[0];
        if (id) {
          return `https://i.imgur.com/${id}.jpg`;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function getEventTargetElement(
  target: EventTarget | null,
): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}
