import { AnchorParser } from "packages/ch-lib/src/index";
import { URL_LIKE_PATTERN, normalizeObfuscatedUrl } from "src/core/url-utils";

interface DecodedMessage {
  nameHtml: string;
  isNameAnchor: boolean;
  mailHtml: string;
  otherHtml: string;
  messageHtml: string;
}

const TRAILING_PUNCTUATION = /[.,!?;:)]$/;
const ALLOWED_NAME_TAG =
  /^<\/?(?:b|small|font(?:\s+color="?[#a-zA-Z0-9]+"?)?|span(?:\s+style="color:\s*[#a-zA-Z0-9]+;?")?)\s*>$/i;

const trimLinkTrailingPunctuation = (rawUrl: string): string => {
  let url = rawUrl;

  // 意図: 本文末尾の句読点や括弧閉じがURLに誤って含まれるとリンク切れになるため、末尾だけを最小限トリムする。
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

interface DecodableRes {
  name: string;
  mail: string;
  other?: string;
  message?: string;
  trip?: string;
  id?: string;
  slip?: string;
  date?: string;
}

export default class MessageProcessor {
  static decode(res: DecodableRes, protocol: string): DecodedMessage {
    const parts = {} as DecodedMessage;

    let nameHtml = (res.name || "")
      .replace(/<\/?a[^>]*>/gi, "")
      // 名前欄の装飾は既存の b/small/font に加えて、色だけを指定する span を許可する。
      // 任意属性を通すと style/javascript の注入経路になるため、許可リストを狭く保つ。
      .replace(/<[^>]*>/g, (tag) => (ALLOWED_NAME_TAG.test(tag) ? tag : tag.replace("<", "&lt;")));

    if (res.trip) {
      nameHtml = nameHtml.replace(res.trip, `<span class="trip">${res.trip}</span>`);
    }
    parts.nameHtml = nameHtml;

    parts.isNameAnchor =
      /^\s*(?:&gt;|\uff1e){0,2}([\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?(?:\s*,\s*[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?)*)\s*$/.test(
        res.name || "",
      );

    parts.mailHtml = (res.mail || "").replace(/<.*?(?:>|$)/g, "");

    let otherHtml = res.other || "";
    if (res.id) {
      // 意図: 受け取るID文字列が "ID:xxxx" / "xxxx" のどちらでも二重プレフィックスを防ぐ。
      const normalizedId = res.id.replace(/^ID:/i, "");
      const idHtml = `<span class="id">ID:${normalizedId}</span>`;
      if (res.slip) {
        const slipHtml = `<span class="slip">SLIP:${res.slip}</span>`;
        const searchId = `ID:${normalizedId}`;
        if (otherHtml.includes(searchId)) {
          otherHtml = otherHtml.replace(searchId, slipHtml + idHtml);
        } else {
          if (otherHtml.includes(normalizedId)) {
            otherHtml = otherHtml.replace(normalizedId, idHtml);
          } else if (otherHtml.includes(res.id)) {
            otherHtml = otherHtml.replace(res.id, idHtml);
          }
          if (!otherHtml.includes(slipHtml)) {
            otherHtml += slipHtml;
          }
        }
      } else {
        const searchId = `ID:${normalizedId}`;
        if (otherHtml.includes(searchId)) {
          otherHtml = otherHtml.replace(searchId, idHtml);
        } else if (otherHtml.includes(normalizedId)) {
          otherHtml = otherHtml.replace(normalizedId, idHtml);
        } else if (otherHtml.includes(res.id)) {
          otherHtml = otherHtml.replace(res.id, idHtml);
        }
      }
    } else if (res.slip) {
      otherHtml += `<span class="slip">SLIP:${res.slip}</span>`;
    }

    if (res.date) {
      otherHtml = otherHtml.replace(res.date, `<time class="date">${res.date}</time>`);
    }
    parts.otherHtml = otherHtml;

    let messageHtml = (res.message || "")
      .replace(/<img src="([\w]+):\/\/(.*?)"[^>]*>/gi, "$1://$2")
      .replace(/<img src="\/\/(.*?)"[^>]*>/gi, `${protocol}//$1`)
      .replace(AnchorParser.REG.ANCHOR, ($0: string) => {
        const anchor = AnchorParser.parse($0);
        const disabled = anchor.targetCount >= 25 || anchor.targetCount === 0;
        const disabledReason =
          anchor.targetCount >= 25
            ? "指定されたレスの量が極端に多いため、ポップアップを表示しません"
            : "指定されたレスが存在しません";

        return `<a href="javascript:undefined;" class="anchor ${disabled ? "disabled" : ""}" ${
          disabled ? `data-disabled-reason="${disabledReason}"` : ""
        }>${$0}</a>`;
      })
      .replace(
        /id:(?:[a-hj-z\d_+/.!]|i(?!d:))+/gi,
        '<a href="javascript:undefined;" class="anchor_id">$&</a>',
      );

    const htmlParts = messageHtml.split(/(<[^>]+>)/);
    let insideAnchor = false;
    messageHtml = htmlParts
      .map((part, index) => {
        if (index % 2 === 1) {
          if (part.startsWith("<a")) insideAnchor = true;
          if (part.startsWith("</a>")) insideAnchor = false;
          return part;
        }

        if (!insideAnchor) {
          return part.replace(URL_LIKE_PATTERN, (matchedUrl: string) => {
            const linkUrl = normalizeObfuscatedUrl(trimLinkTrailingPunctuation(matchedUrl));
            return `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${linkUrl}</a>`;
          });
        }
        return part;
      })
      .join("");

    parts.messageHtml = messageHtml;

    return parts;
  }
}
