import MessageProcessor from "src/core/MessageProcessor";
import { stripHtml } from "src/core/strip-html";
import type { IRes } from "src/service-container";

/**
 * レスの表示用HTMLとコピー・検索用テキストだけを扱う。
 * これらは MessageProcessor と IRes に依存するため、URLやDOMイベントの補助処理から
 * 分離して、レスのデータ変換だけを追えるようにしている。
 */

export { stripHtml } from "src/core/strip-html";

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

export interface DecodedMessageParts {
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
