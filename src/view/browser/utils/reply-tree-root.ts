/**
 * 返信ツリーの起点レス番号を解決する。
 *
 * ancIndex(レス -> 参照先レス集合)を「直接参照の連鎖」として上方向に辿る。
 *
 * 全探索で最小番号を取ると、密な相互アンカーがあるスレで枝が爆発しやすく、
 * ポップアップ連鎖時の更新負荷が急増するため、
 * 「そのレスが直接参照している候補のうち最小」を1ステップずつ辿る。
 * 循環や異常データでも止まるように visited と反復上限を設ける。
 */
export function resolveReplyTreeRootResNum(
  resNum: number,
  ancIndex: Map<number, Set<number>>,
  resMap: Map<number, unknown>,
): number {
  const MAX_ASCENT_STEPS = 256;
  const visited = new Set<number>();
  let rootResNum = resNum;
  let currentResNum = resNum;
  let steps = 0;

  while (steps < MAX_ASCENT_STEPS && !visited.has(currentResNum)) {
    visited.add(currentResNum);
    const ancestors = ancIndex.get(currentResNum);
    if (!ancestors || ancestors.size === 0) {
      break;
    }

    // 「先頭から開く」は通常、過去レス方向の流れを辿りたいので、
    // 直接参照の中でも現在番号より小さいものだけを候補にする。
    const nextCandidates = Array.from(ancestors)
      .filter((ancestorResNum) => ancestorResNum < currentResNum)
      .filter((ancestorResNum) => resMap.has(ancestorResNum));
    if (nextCandidates.length === 0) {
      break;
    }

    const nextResNum = Math.min(...nextCandidates);
    if (visited.has(nextResNum)) {
      break;
    }

    rootResNum = nextResNum;
    currentResNum = nextResNum;
    steps += 1;
  }

  return rootResNum;
}
