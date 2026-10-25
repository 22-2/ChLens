import { buildReplyIndexes } from "src/core/thread/reply-index";
import type { IRes } from "src/service-container";

/** 単一ポップアップ内で、同じ宛先へ別々のレスから返信したIDの返信レス番号。 */
export function findRepeatedReplyNums(responses: readonly IRes[]): ReadonlySet<number> {
  const resMap = new Map(responses.map((res) => [res.num, res]));
  const { repIndex } = buildReplyIndexes([...resMap.values()]);
  const repeated = new Set<number>();
  for (const sources of repIndex.values()) {
    const sourcesById = new Map<string, number[]>();
    for (const num of sources) {
      const id = resMap.get(num)?.id;
      // ID表記を正規化すると別IDを同一視するため、空IDを除き完全一致で比較する。
      if (!id?.trim()) continue;
      const nums = sourcesById.get(id) ?? [];
      nums.push(num);
      sourcesById.set(id, nums);
    }
    for (const nums of sourcesById.values()) {
      if (nums.length < 2) continue;
      for (const num of nums) repeated.add(num);
    }
  }
  return repeated;
}
