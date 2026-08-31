export interface ReplyIndexedResponse {
  num: number;
  message: string;
}

export interface ReplyIndexes {
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
}

// レスポンスの本文から既存のアンカー表示と同じ形式で参照先を抽出する。
// 25件を超えて一括指定するアンカーはポップアップ対象外のため、返信数にも含めない。
// 互換掲示板のdatにはHTMLエンティティ化されていない生の「>>」が含まれる場合もある。
const ANCHOR_REG =
  /(?:(?:&gt;|＞){1,2}|>>)([\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?(?:\s*[,、]\s*[\d\uff10-\uff19]+(?:[-\u30fc][\d\uff10-\uff19]+)?)*)/g;
const FW_NUM_REG = /[\uff10-\uff19]/g;

export function parseReplyAnchorTargets(message: string): number[] {
  const targets: number[] = [];
  ANCHOR_REG.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = ANCHOR_REG.exec(message)) !== null) {
    const raw = match[1].replace(FW_NUM_REG, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30),
    );
    const parts = raw.split(/\s*[,、]\s*/);

    for (const part of parts) {
      const range = part.split(/[-\u30fc]/);
      const start = parseInt(range[0], 10);
      const end = range.length > 1 ? parseInt(range[1], 10) : start;
      // 25件を超える範囲指定は既存のアンカー索引と同じく無視する。
      if (Number.isNaN(start) || Number.isNaN(end) || end - start >= 25) {
        continue;
      }
      for (let target = start; target <= end; target += 1) {
        targets.push(target);
      }
    }
  }

  return targets;
}

/** レスが参照するレス先の数を返す。同じレス先への重複参照は1件として数える。 */
export function countReplyAnchorTargets(message: string): number {
  return new Set(parseReplyAnchorTargets(message)).size;
}

export function buildReplyIndexes(responses: readonly ReplyIndexedResponse[]): ReplyIndexes {
  const repIndex = new Map<number, Set<number>>();
  const ancIndex = new Map<number, Set<number>>();

  for (const response of responses) {
    for (const target of parseReplyAnchorTargets(response.message)) {
      if (!repIndex.has(target)) repIndex.set(target, new Set());
      repIndex.get(target)!.add(response.num);

      if (!ancIndex.has(response.num)) ancIndex.set(response.num, new Set());
      ancIndex.get(response.num)!.add(target);
    }
  }

  return { repIndex, ancIndex };
}
