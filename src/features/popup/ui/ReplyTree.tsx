import { useVirtualizer } from "@tanstack/react-virtual";
import { MoreVertical } from "lucide-react";
import React, { useMemo, useRef } from "react";
import type { SubTreeMenuClickHandler } from "src/features/popup/browser/use-reply-tree-menus";
import { PopupResCard } from "src/features/popup/ui/PopupResCard";
import type { IRes } from "src/service-container";
import { MAX_TREE_DEPTH } from "src/view/browser/utils/constants";

export interface ReplyTreeProps {
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  anchorPreviewDepth: number;
  /** 個別ツリーの三点メニュークリック時コールバック（渡された場合のみボタン表示） */
  onSubTreeMenu?: SubTreeMenuClickHandler;
  /** 「ツリー先頭から」で開いたとき、元の操作対象としてツリー内で薄く強調するレス番号 */
  focusResNum?: number;
}

/** 再帰しても変わらない、ツリー全体で共有する props。 */
type ReplyTreeSharedProps = Omit<ReplyTreeProps, "resNum">;

/** 深さ上限・循環・複数経路の重複を、描画と同じ順序で除いたレス一覧。 */
export function collectReplyTreeResponses(
  resNum: number,
  repIndex: Map<number, Set<number>>,
  resMap: Map<number, IRes>,
): IRes[] {
  const result: IRes[] = [];
  const visited = new Set<number>();
  const visit = (num: number, depth: number) => {
    if (depth >= MAX_TREE_DEPTH) return;
    const replies = [...(repIndex.get(num) ?? [])]
      .sort((a, b) => a - b)
      .filter((n) => !visited.has(n) && resMap.has(n));
    for (const reply of replies) {
      visited.add(reply);
      result.push(resMap.get(reply)!);
      visit(reply, depth + 1);
    }
  };
  visit(resNum, 0);
  return result;
}

interface TreeRow {
  res: IRes;
  depth: number;
  ancestors: number[];
  hasChildTree: boolean;
}

function collectTreeRows(
  resNum: number,
  repIndex: Map<number, Set<number>>,
  resMap: Map<number, IRes>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const visited = new Set<number>();
  const visit = (num: number, depth: number, ancestors: number[]) => {
    if (depth >= MAX_TREE_DEPTH) return;
    const replies = [...(repIndex.get(num) ?? [])].sort((a, b) => a - b);
    for (const reply of replies) {
      if (visited.has(reply) || !resMap.has(reply)) continue;
      visited.add(reply);
      const hasChildTree = hasRenderableChildTree(reply, repIndex, resMap, visited, depth);
      rows.push({ res: resMap.get(reply)!, depth, ancestors, hasChildTree });
      visit(reply, depth + 1, [...ancestors, reply]);
    }
  };
  visit(resNum, 0, [resNum]);
  return rows;
}

/** 大量の返信を持つツリーでは、経路を保ちながら表示中のカードだけを作る。 */
export function VirtualReplyTree({
  source,
  resNum,
  repIndex,
  resMap,
  anchorPreviewDepth,
  onSubTreeMenu,
  focusResNum,
}: ReplyTreeProps & { source: React.ReactNode }) {
  const rows = useMemo(() => collectTreeRows(resNum, repIndex, resMap), [resNum, repIndex, resMap]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length + 1,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => (index === 0 ? "source" : rows[index - 1].res.num),
    estimateSize: () => 120,
    overscan: 5,
    initialRect: { width: 520, height: 500 },
  });
  return (
    <div className="res-popup__body" ref={scrollRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = item.index === 0 ? null : rows[item.index - 1];
          let content: React.ReactNode = row ? (
            <div className="reply-tree-node">
              <PopupResCard
                res={row.res}
                isFocused={focusResNum === row.res.num}
                anchorPreviewDepth={anchorPreviewDepth}
                repIndex={repIndex}
              />
              {onSubTreeMenu && (
                <button
                  type="button"
                  className="reply-tree-node__menu-btn"
                  aria-label="サブツリーメニュー"
                  title="このレス以降のツリーをコピー"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSubTreeMenu(row.res.num, row.ancestors, row.hasChildTree, event);
                  }}
                >
                  <MoreVertical size={12} />
                </button>
              )}
            </div>
          ) : (
            source
          );
          if (row) {
            for (let depth = row.depth; depth >= 0; depth -= 1) {
              content = (
                <div className={depth > 0 ? "reply-tree reply-tree--nested" : "reply-tree"}>
                  {content}
                </div>
              );
            }
          }
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ReplyTreeBranchProps {
  shared: ReplyTreeSharedProps;
  resNum: number;
  depth: number;
  /** 循環参照と重複表示を防ぐため、ツリー全体で描画済みのレス番号を共有する。 */
  visited: Set<number>;
  /** 画面に描画された枝を正確に逆引きするための、参照元から親レスまでの経路 */
  ancestorResNums: number[];
}

function hasRenderableChildTree(
  resNum: number,
  repIndex: Map<number, Set<number>>,
  resMap: Map<number, IRes>,
  visited: Set<number>,
  depth: number,
): boolean {
  // MAX_TREE_DEPTH 到達後は子レスを描画しないため、「このレス以降」の項目を表示しない。
  if (depth + 1 >= MAX_TREE_DEPTH) {
    return false;
  }

  return Array.from(repIndex.get(resNum) ?? []).some(
    (replyNum) => !visited.has(replyNum) && resMap.has(replyNum),
  );
}

// 変更理由: 以前は20個以上の props を再帰のたびに1つずつ書き写しており、渡し忘れが起きやすかった。
// リンクやアンカーのハンドラーは PopupResCardScope から PopupResCard が直接受け取るため、
// ここでは木の構造に関わる共有 props だけを引き継ぎ、再帰ごとに変わる値（resNum、depth、経路）を個別に渡す。
const ReplyTreeBranch: React.FC<ReplyTreeBranchProps> = ({
  shared,
  resNum,
  depth,
  visited,
  ancestorResNums,
}) => {
  const { repIndex, resMap, anchorPreviewDepth, onSubTreeMenu, focusResNum } = shared;

  if (depth >= MAX_TREE_DEPTH) return null;
  const replies = repIndex.get(resNum);
  if (!replies || replies.size === 0) return null;

  const validReplies = Array.from(replies)
    .sort((a, b) => a - b)
    .filter((n) => !visited.has(n) && resMap.has(n));

  if (validReplies.length === 0) return null;

  return (
    <div className={depth > 0 ? "reply-tree reply-tree--nested" : "reply-tree"}>
      {validReplies.map((replyNum) => {
        // 循環参照防止のためvisitedに追加
        visited.add(replyNum);
        const res = resMap.get(replyNum)!;
        const hasChildTree = hasRenderableChildTree(replyNum, repIndex, resMap, visited, depth);
        return (
          <React.Fragment key={replyNum}>
            <div className="reply-tree-node">
              <PopupResCard
                res={res}
                isFocused={focusResNum === res.num}
                // アンカープレビュー配下で開いた返信ツリーは、その階層を子レスにも引き継ぐ。
                // ここを 0 に戻すと、次のアンカーホバーで親プレビューごと閉じる回帰が起きる。
                anchorPreviewDepth={anchorPreviewDepth}
                repIndex={repIndex}
              />
              {onSubTreeMenu && (
                <button
                  type="button"
                  className="reply-tree-node__menu-btn"
                  aria-label="サブツリーメニュー"
                  title="このレス以降のツリーをコピー"
                  onClick={(e) => {
                    e.stopPropagation();
                    // 同じレスが複数レスへアンカーしていても、実際に表示された一本の枝を渡す。
                    onSubTreeMenu(replyNum, ancestorResNums, hasChildTree, e);
                  }}
                >
                  <MoreVertical size={12} />
                </button>
              )}
            </div>
            <ReplyTreeBranch
              shared={shared}
              resNum={replyNum}
              depth={depth + 1}
              visited={visited}
              ancestorResNums={[...ancestorResNums, replyNum]}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};

// --- 再帰的返信ツリー ---
export const ReplyTree: React.FC<ReplyTreeProps> = ({ resNum, ...shared }) => (
  // 描画のたびに新しい visited から辿り直し、起点レス自身を経路の先頭にする。
  <ReplyTreeBranch
    shared={shared}
    resNum={resNum}
    depth={0}
    visited={new Set()}
    ancestorResNums={[resNum]}
  />
);
