import MessageProcessor from "src/core/MessageProcessor";
import type { IRes } from "src/service-container";

/**
 * レスの表示用HTMLとコピー・検索用テキストだけを扱う。
 * これらは MessageProcessor と IRes に依存するため、URLやDOMイベントの補助処理から
 * 分離して、レスのデータ変換だけを追えるようにしている。
 */

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

/** HTMLからテキストを抽出する（検索フィルタ・コピー用）。 */
export function stripHtml(html: string): string {
  // <br> は改行に変換してからタグを除去することで、コピー時に改行が反映されるようにする。
  // レス本文には数値文字参照の絵文字が混ざることがあるため、タグ除去後にデコードする。
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
