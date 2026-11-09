import { parseReplyAnchorTargets } from "src/core/thread/reply-index";
import { stripHtml } from "src/core/util/strip-html";
import { extractUrlsFromMessage, toViewerImageUrl } from "src/core/util/url-media";
import type { IRes } from "src/service-container";

/** 返信先レスの表示用要約。 */
export interface ReplyPreview {
  num: number;
  /** 右クリックメニューなど、返信先レスそのものを対象にする操作で使う。 */
  res: IRes;
  /** 返信先の本文の要約。返信先自身のアンカーも含める。本文が画像だけなら空文字になる。 */
  text: string;
  hasImage: boolean;
}

// 2行まで表示するため、1行分より長めに切り出す。表示側の行数制限で最終的に省略する。
const PREVIEW_MAX_LENGTH = 200;

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
  const text = stripHtml(target.message).replace(/\s+/g, " ").trim().slice(0, PREVIEW_MAX_LENGTH);
  return { num: target.num, res: target, text, hasImage };
}
