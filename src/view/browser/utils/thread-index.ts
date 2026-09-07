import { buildReplyIndexes } from "src/core/reply-index";
import type { IRes } from "src/service-container";

// --- インデックス構築 ---
interface ThreadIndexes {
  idIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
}
interface BuildIndexesOptions {
  excludeHardNgResponses?: boolean;
}

export function buildIndexes(
  responses: IRes[],
  { excludeHardNgResponses = false }: BuildIndexesOptions = {},
): ThreadIndexes {
  const idIndex = new Map<string, Set<number>>();
  const resMap = new Map<number, IRes>();

  const replyIndexedResponses = excludeHardNgResponses
    ? responses.filter((res) => res.ng == null && !res.class?.includes("ng"))
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
