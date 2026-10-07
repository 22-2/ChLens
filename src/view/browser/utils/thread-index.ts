import { buildReplyIndexes } from "src/core/thread/reply-index";
import type { IRes } from "src/service-container";
import { type NgDisplayMode, resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";

// --- インデックス構築 ---
interface ThreadIndexes {
  idIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
}
interface BuildIndexesOptions {
  /** 指定時、この全体表示方式でhard-ngとなるNGレスを返信索引から除外する。 */
  hardNgExclusionMode?: NgDisplayMode;
}

export function buildIndexes(
  responses: IRes[],
  { hardNgExclusionMode }: BuildIndexesOptions = {},
): ThreadIndexes {
  const idIndex = new Map<string, Set<number>>();
  const resMap = new Map<number, IRes>();

  // collapseルールのレスは折りたたみ表示で残るため、レスごとの表示方式でhard-ngだけを除外する。
  const replyIndexedResponses = hardNgExclusionMode
    ? responses.filter(
        (res) =>
          (res.ng == null && !res.class?.includes("ng")) ||
          resolveNgDisplayMode(hardNgExclusionMode, res.ng) !== "hard-ng",
      )
    : responses;
  // hard-ngのレスは返信ツリーと返信数からも除外し、非表示レスがUIの返信情報へ残らないようにする。
  const replyIndexes = buildReplyIndexes(replyIndexedResponses);

  for (const res of responses) {
    resMap.set(res.num, res);

    if (res.id) {
      if (!idIndex.has(res.id)) idIndex.set(res.id, new Set());
      idIndex.get(res.id)!.add(res.num);
    }
  }

  return {
    idIndex,
    repIndex: replyIndexes.repIndex,
    ancIndex: replyIndexes.ancIndex,
    resMap,
  };
}
