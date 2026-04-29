import { AnchorParser } from "packages/ch-lib/src/index";

/**
 * MessageProcessor handles the transformation of response data into displayable HTML segments.
 */
export default class MessageProcessor {
  /**
   * @typedef {Object} DecodedMessage
   * @property {string} nameHtml
   * @property {boolean} isNameAnchor
   * @property {string} mailHtml
   * @property {string} otherHtml
   * @property {string} messageHtml
   */

  /**
   * Processes a response object and returns HTML segments for its various parts.
   * @param {any} res The response data from ThreadModel
   * @param {string} protocol The current protocol (http: or https:)
   * @returns {DecodedMessage} An object containing html segments
   */
  static decode(res, protocol) {
    const parts = {};

    // 1. Name processing
    // Remove <a> tags and escape some characters, but keep basic formatting
    let nameHtml = res.name
      .replace(/<\/?a[^>]*>/g, "")
      .replace(
        /<(?!\/?(?:b|small|font(?: color="?[#a-zA-Z0-9]+"?)?)>)/g,
        "&lt;",
      );

    // TRIP markup
    if (res.trip) {
      nameHtml = nameHtml.replace(
        res.trip,
        `<span class="trip">${res.trip}</span>`,
      );
    }
    parts.nameHtml = nameHtml;

    // Name Anchor detection (pattern for '>>1' style names)
    parts.isNameAnchor =
      /^\s*(?:&gt;|\uff1e){0,2}([\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?(?:\s*,\s*[\d\uff10-\uff19]+(?:[\-\u30fc][\d\uff10-\uff19]+)?)*)\s*$/.test(
        res.name,
      );

    // 2. Mail processing
    parts.mailHtml = res.mail.replace(/<.*?(?:>|$)/g, "");

    // 3. Other processing (ID, Slip, Date)
    let otherHtml = res.other || "";
    // ID & SLIP markup
    if (res.id) {
      const idHtml = `<span class="id">${res.id}</span>`;
      if (res.slip) {
        const slipHtml = `<span class="slip">SLIP:${res.slip}</span>`;
        // Replace ID with SLIP + ID if both exist
        // Be careful not to double the ID: prefix if res.id already includes it
        const searchId = res.id.startsWith("ID:") ? res.id : `ID:${res.id}`;
        if (otherHtml.includes(searchId)) {
          otherHtml = otherHtml.replace(searchId, slipHtml + idHtml);
        } else {
          // Fallback: replace ID directly and append SLIP
          otherHtml = otherHtml.replace(res.id, idHtml);
          if (!otherHtml.includes(slipHtml)) {
            otherHtml += slipHtml;
          }
        }
      } else {
        otherHtml = otherHtml.replace(res.id, idHtml);
      }
    } else if (res.slip) {
      otherHtml += `<span class="slip">SLIP:${res.slip}</span>`;
    }

    // Date markup
    if (res.date) {
      otherHtml = otherHtml.replace(
        res.date,
        `<time class="date">${res.date}</time>`,
      );
    }
    parts.otherHtml = otherHtml;

    // 4. Message processing
    // Fix image tags and convert anchors/ID links
    let messageHtml = (res.message || "")
      .replace(/<img src="([\w]+):\/\/(.*?)"[^>]*>/gi, "$1://$2")
      .replace(/<img src="\/\/(.*?)"[^>]*>/gi, `${protocol}//$1`)
      .replace(AnchorParser.REG.ANCHOR, (/** @type {string} */ $0) => {
        const anchor = AnchorParser.parse($0);
        let disabled = anchor.targetCount >= 25 || anchor.targetCount === 0;
        let disabledReason =
          anchor.targetCount >= 25
            ? "指定されたレスの量が極端に多いため、ポップアップを表示しません"
            : "指定されたレスが存在しません";

        return `<a href="javascript:undefined;" class="anchor ${
          disabled ? "disabled" : ""
        }" ${
          disabled ? `data-disabled-reason="${disabledReason}"` : ""
        }>${$0}</a>`;
      })
      .replace(
        /id:(?:[a-hj-z\d_\+\/\.\!]|i(?!d:))+/gi,
        '<a href="javascript:undefined;" class="anchor_id">$&</a>',
      );

    // Convert plain URLs to anchor tags
    // Split by existing tags to avoid double-converting
    const htmlParts = messageHtml.split(/(<[^>]+>)/);
    let insideAnchor = false;
    messageHtml = htmlParts
      .map((part, index) => {
        // odd indices are tags
        if (index % 2 === 1) {
          if (part.startsWith("<a")) insideAnchor = true;
          if (part.startsWith("</a>")) insideAnchor = false;
          return part;
        }
        // Only process text parts that are not inside an anchor tag
        if (!insideAnchor) {
          return part.replace(
            /(https?:\/\/[^\s<>"]+)/gi,
            '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
          );
        }
        return part;
      })
      .join("");

    parts.messageHtml = messageHtml;

    return parts;
  }
}
