import { buildReplyIndexes } from "src/core/reply-index";
import type { IRes } from "src/service-container";

// --- インデックス構築 ---
interface ThreadIndexes {
  idIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
}
export function buildIndexes(responses: IRes[]): ThreadIndexes {
  const idIndex = new Map<string, Set<number>>();
  const resMap = new Map<number, IRes>();

  const replyIndexes = buildReplyIndexes(responses);

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
