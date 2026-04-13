import type { IRes } from "src/service-container";
import { parseAnchors } from "src/view/browser/pages/utils";

// --- インデックス構築 ---
interface ThreadIndexes {
  idIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
}
export function buildIndexes(responses: IRes[]): ThreadIndexes {
  const idIndex = new Map<string, Set<number>>();
  const repIndex = new Map<number, Set<number>>();
  const ancIndex = new Map<number, Set<number>>();
  const resMap = new Map<number, IRes>();

  for (const res of responses) {
    resMap.set(res.num, res);

    if (res.id) {
      if (!idIndex.has(res.id)) idIndex.set(res.id, new Set());
      idIndex.get(res.id)!.add(res.num);
    }

    const targets = parseAnchors(res.message);
    for (const target of targets) {
      if (!repIndex.has(target)) repIndex.set(target, new Set());
      repIndex.get(target)!.add(res.num);
      if (!ancIndex.has(res.num)) ancIndex.set(res.num, new Set());
      ancIndex.get(res.num)!.add(target);
    }
  }

  return { idIndex, repIndex, ancIndex, resMap };
}
