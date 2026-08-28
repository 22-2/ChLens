import { parseReplyAnchorTargets } from "src/core/reply-index";

/**
 * レスアンカーの解析をまとめる。
 * 返信索引の解析と画面上のアンカー表示解析は同じ番号表現を扱うが、DOMやレス表示を
 * 直接知らないため、この純粋な番号変換モジュールに置いて循環依存を避ける。
 */

// MessageProcessor由来のHTML内のアンカー（>>N）から参照先レス番号を抽出する。
export const parseAnchors = parseReplyAnchorTargets;

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
