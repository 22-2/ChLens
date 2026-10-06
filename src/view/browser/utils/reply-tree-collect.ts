import type { IRes } from "src/service-container";
import { formatResForCopy } from "src/view/browser/utils/response-format";

/** 返信ツリーを平坦化した1件分。depth は起点レスの直下を 0 とする。 */
export interface ReplyTreeEntry {
  res: IRes;
  depth: number;
}

/** 選択レスから遡った一本の枝を、起点レスとその下に続く返信列へ並べ直したもの。 */
export interface ReplyTreeAncestorPath {
  sourceRes: IRes;
  replyResponses: IRes[];
}

/**
 * 起点レスから深さ優先で返信を辿り、表示順のまま平坦化する。
 *
 * 一括コピーと画像コピーは「今見えている返信ツリー」をそのまま再現したいので、
 * 返信番号の昇順に深さ優先で辿り、一度出たレスは循環や重複アンカーでも再度出さない。
 * 以前はテキスト用と画像用に同じ探索が二重に実装されていたため、ここへ一本化した。
 */
export function collectReplyTreeEntries(
  sourceResNum: number,
  repIndex: Map<number, Set<number>>,
  resMap: Map<number, IRes>,
): ReplyTreeEntry[] {
  const visited = new Set<number>([sourceResNum]);
  const collected: ReplyTreeEntry[] = [];

  const visit = (resNum: number, depth: number) => {
    const replies = repIndex.get(resNum);
    if (!replies) {
      return;
    }

    const orderedReplyNums = Array.from(replies).sort((left, right) => left - right);
    for (const replyNum of orderedReplyNums) {
      if (visited.has(replyNum)) {
        continue;
      }

      const reply = resMap.get(replyNum);
      if (!reply) {
        continue;
      }

      visited.add(replyNum);
      collected.push({ res: reply, depth });
      visit(replyNum, depth + 1);
    }
  };

  visit(sourceResNum, 0);
  return collected;
}

export function collectReplyTreeResponses(
  sourceResNum: number,
  repIndex: Map<number, Set<number>>,
  resMap: Map<number, IRes>,
): IRes[] {
  return collectReplyTreeEntries(sourceResNum, repIndex, resMap).map((entry) => entry.res);
}

/**
 * 画面に描画された枝（参照元から親レスまでの番号列）と選択レスから、
 * 上から下へ読める一本筋を組み立てる。
 *
 * 枝の特定は選択レスから親へ遡って行うが、出力は既存コピーと同じ上から下に揃える。
 * 解決できない祖先しかない場合は、選択レス単体を起点として扱う。
 */
export function resolveReplyTreeAncestorPath(
  targetRes: IRes,
  ancestorResNums: readonly number[],
  resMap: Map<number, IRes>,
): ReplyTreeAncestorPath {
  const ancestorResponses = ancestorResNums
    .map((ancestorResNum) => resMap.get(ancestorResNum))
    .filter((res): res is IRes => res != null);

  if (ancestorResponses.length === 0) {
    return { sourceRes: targetRes, replyResponses: [] };
  }

  return {
    sourceRes: ancestorResponses[0],
    replyResponses: [...ancestorResponses.slice(1), targetRes],
  };
}

export function buildReplyTreeCopyText(
  sourceRes: IRes,
  replyResponses: IRes[],
  threadTitle?: string,
  threadUrl?: string,
): string {
  // 変更理由: 参照元レスの内容は残しつつ、内部向けの見出しを除いて
  // コピー先へそのまま貼り付けやすいレス列にする。
  const sections = [formatResForCopy(sourceRes)];
  if (replyResponses.length > 0) {
    sections.push("", "[返信レス]", replyResponses.map(formatResForCopy).join("\n\n"));
  }
  // コピー先でスレッドを特定できるよう末尾にスレタイとURLを付加する。
  if (threadTitle != null || threadUrl != null) {
    sections.push("");
    if (threadTitle != null) {
      sections.push(threadTitle);
    }
    if (threadUrl != null) {
      sections.push(threadUrl);
    }
  }
  return sections.join("\n");
}
