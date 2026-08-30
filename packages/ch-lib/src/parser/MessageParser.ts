import { AnchorParser, type AnchorData } from "./AnchorParser";
import { URL_LIKE_PATTERN, normalizeObfuscatedUrl } from "../url/text";

export interface MessageParserOptions {
  /** Protocol used when an image tag contains a protocol-relative source. */
  protocol: string;
}

export type MessageToken =
  | { type: "text"; value: string }
  | { type: "tag"; value: string }
  | { type: "anchor"; value: string; data: AnchorData }
  | { type: "id"; value: string }
  | { type: "url"; value: string; href: string };

const ID_PATTERN = /id:(?:[a-hj-z\d_+/.!]|i(?!d:))+/gi;
const TAG_PATTERN = /<[^>]+>/;
const TRAILING_PUNCTUATION = /[.,!?;:)]$/;

const trimLinkTrailingPunctuation = (rawUrl: string): string => {
  let url = rawUrl;

  // 意図: 文章末尾の句読点や括弧閉じがURLに含まれても、リンク先には含めない。
  while (TRAILING_PUNCTUATION.test(url)) {
    const tail = url.at(-1);
    if (tail !== ")") {
      url = url.slice(0, -1);
      continue;
    }

    const openingParenCount = (url.match(/\(/g) || []).length;
    const closingParenCount = (url.match(/\)/g) || []).length;
    if (closingParenCount > openingParenCount) {
      url = url.slice(0, -1);
      continue;
    }
    break;
  }

  return url;
};

function normalizeImageTags(message: string, protocol: string): string {
  return message
    .replace(
      /<img src="([\w]+):\/\/(.*?)"[^>]*>/gi,
      (_tag: string, scheme: string, rest: string) => `${scheme}://${rest}`,
    )
    // 本文URLと同じ誤記をimgタグ由来のURLでもリンク・メディア判定できるようにする。
    .replace(
      /<img src="(https?):\/(?!\/)(.*?)"[^>]*>/gi,
      (_tag: string, scheme: string, rest: string) => `${scheme}://${rest}`,
    )
    .replace(
      /<img src="\/\/(.*?)"[^>]*>/gi,
      (_tag: string, rest: string) => `${protocol}//${rest}`,
    );
}

type InlineMatch = {
  index: number;
  value: string;
  type: "anchor" | "id";
};

function findNextInlineMatch(text: string, offset: number): InlineMatch | null {
  const patterns: Array<{ type: InlineMatch["type"]; pattern: RegExp }> = [
    { type: "anchor", pattern: new RegExp(AnchorParser.REG.ANCHOR.source, "g") },
    { type: "id", pattern: new RegExp(ID_PATTERN.source, "gi") },
  ];

  let nextMatch: InlineMatch | null = null;
  for (const candidate of patterns) {
    candidate.pattern.lastIndex = offset;
    const match = candidate.pattern.exec(text);
    if (!match) continue;

    if (nextMatch === null || match.index < nextMatch.index) {
      nextMatch = {
        index: match.index,
        value: match[0],
        type: candidate.type,
      };
    }
  }

  return nextMatch;
}

function appendToken(tokens: MessageToken[], token: MessageToken): void {
  if (token.type === "text" && token.value === "") return;

  const previous = tokens.at(-1);
  if (previous?.type === "text" && token.type === "text") {
    previous.value += token.value;
    return;
  }
  tokens.push(token);
}

function parseTextTokens(
  text: string,
  linkifyUrls: boolean,
  fallbackProtocol: string,
): MessageToken[] {
  const tokens: MessageToken[] = [];
  let offset = 0;

  while (offset < text.length) {
    // 旧表示処理と同じく、アンカーとIDリンクを先に確定してからURLを解析する。
    // そうしないとURL内の "id:" までURLトークンに取り込まれ、表示結果が変わる。
    const match = findNextInlineMatch(text, offset);
    if (!match) {
      for (const token of parseUrlTokens(text.slice(offset), linkifyUrls, fallbackProtocol)) {
        appendToken(tokens, token);
      }
      break;
    }

    if (match.index > offset) {
      for (const token of parseUrlTokens(
        text.slice(offset, match.index),
        linkifyUrls,
        fallbackProtocol,
      )) {
        appendToken(tokens, token);
      }
    }

    if (match.type === "anchor") {
      appendToken(tokens, {
        type: "anchor",
        value: match.value,
        data: AnchorParser.parse(match.value),
      });
    } else if (match.type === "id") {
      appendToken(tokens, { type: "id", value: match.value });
    }

    offset = match.index + match.value.length;
  }

  return tokens;
}

function parseUrlTokens(
  text: string,
  linkifyUrls: boolean,
  fallbackProtocol: string,
): MessageToken[] {
  if (!linkifyUrls) return [{ type: "text", value: text }];

  const tokens: MessageToken[] = [];
  const pattern = new RegExp(URL_LIKE_PATTERN.source, "gi");
  let offset = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > offset) {
      appendToken(tokens, { type: "text", value: text.slice(offset, match.index) });
    }

    const displayUrl = trimLinkTrailingPunctuation(match[0]);
    appendToken(tokens, {
      type: "url",
      value: displayUrl,
      href: normalizeObfuscatedUrl(displayUrl, fallbackProtocol),
    });

    // 解析で取り除いた句読点を捨てずに本文へ戻す。
    const trailingText = match[0].slice(displayUrl.length);
    appendToken(tokens, { type: "text", value: trailingText });
    offset = match.index + match[0].length;
  }

  if (offset < text.length) {
    appendToken(tokens, { type: "text", value: text.slice(offset) });
  }
  return tokens;
}

function isAnchorStartTag(tag: string): boolean {
  return /^<a(?:\s|>)/i.test(tag);
}

function isAnchorEndTag(tag: string): boolean {
  return /^<\/a\s*>/i.test(tag);
}

/**
 * Parses message markup into semantic tokens without generating application HTML.
 *
 * The parser preserves existing tags as tokens because compatible boards can send
 * small pieces of legacy markup such as <br>. Rendering and security policy remain
 * in MessageProcessor, while this layer owns only reusable text interpretation.
 */
export function parseMessage(message: string, options: MessageParserOptions): MessageToken[] {
  const tokens: MessageToken[] = [];
  const normalizedMessage = normalizeImageTags(message, options.protocol);
  let insideAnchor = false;

  for (const part of normalizedMessage.split(/(<[^>]+>)/)) {
    if (!part) continue;

    if (TAG_PATTERN.test(part)) {
      appendToken(tokens, { type: "tag", value: part });
      if (isAnchorStartTag(part)) insideAnchor = true;
      if (isAnchorEndTag(part)) insideAnchor = false;
      continue;
    }

    for (const token of parseTextTokens(part, !insideAnchor, options.protocol)) {
      appendToken(tokens, token);
    }
  }

  return tokens;
}
