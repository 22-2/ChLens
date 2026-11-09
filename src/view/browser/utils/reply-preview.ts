import { parseReplyAnchorTargets } from "src/core/thread/reply-index";
import { stripHtml } from "src/core/util/strip-html";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/core/util/url-media";
import type { IRes } from "src/service-container";

/** 返信先レスの表示用要約。 */
export interface ReplyPreview {
  num: number;
  /** アンカーを除いた本文の要約。本文が画像だけなら空文字になる。 */
  text: string;
  hasImage: boolean;
}

// 本文中の >>N 形式のアンカーを取り除いて、返信先本文だけを要約に残す。
const ANCHOR_REG = /(?:(?:&gt;|＞){1,2}|>>)[\d\uff10-\uff19,、\-\u30fc\s]*/g;
const PREVIEW_MAX_LENGTH = 120;

/**
 * レスの最初のアンカーが指す返信先を要約する。
 * 変更理由: Discordの返信表示のように、返信元レスを開かずに文脈を追えるようにする。
 * 返信先がNG対象のときは本文を漏らさないよう要約を作らない。
 */
export function buildReplyPreview(
  res: Pick<IRes, "num" | "message">,
  resMap: ReadonlyMap<number, IRes>,
): ReplyPreview | null {
  const targetNum = parseReplyAnchorTargets(res.message).find((num) => num < res.num);
  if (targetNum === undefined) return null;
  const target = resMap.get(targetNum);
  if (!target || target.ng != null || target.class?.includes("ng")) return null;

  const hasImage = extractUrlsFromMessage(target.message).some(
    (url) => toViewerImageUrl(url) != null,
  );
  const text = stripHtml(target.message)
    .replace(ANCHOR_REG, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PREVIEW_MAX_LENGTH);
  return { num: target.num, text, hasImage };
}
