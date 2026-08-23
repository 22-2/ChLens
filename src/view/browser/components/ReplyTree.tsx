import { MoreVertical } from "lucide-react";
import React from "react";
import type { IRes } from "src/service-container";
import { PopupResCard } from "src/view/browser/components/PopupResCard";
import { MAX_TREE_DEPTH } from "src/view/browser/utils/constants";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

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

// --- 再帰的返信ツリー ---
export const ReplyTree: React.FC<{
  resNum: number;
  repIndex: Map<number, Set<number>>;
  idIndex?: Map<string, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  anchorPreviewDepth: number;
  onUrlClick: UrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onLinkMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onResContextMenu: (e: React.MouseEvent, res: IRes) => void;
  visited: Set<number>;
  depth: number;
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  /** ツリー内のアンカー先NG強調にも同じ判定集合を使う。 */
  ngResNums?: ReadonlySet<number>;
  /** 個別ツリーの三点メニュークリック時コールバック（渡された場合のみボタン表示） */
  onSubTreeMenu?: (
    resNum: number,
    ancestorResNums: number[],
    hasChildTree: boolean,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  /** 画面に描画された枝を正確に逆引きするための、参照元から親レスまでの経路 */
  ancestorResNums?: number[];
  threadKey?: string;
}> = ({
  resNum,
  repIndex,
  idIndex,
  resMap,
  messageProtocol,
  anchorPreviewDepth,
  onUrlClick,
  onUrlContextMenu,
  onLinkMiddleClickStart,
  onIdLinkClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  visited,
  depth,
  blurredResNums,
  ngResNums,
  onSubTreeMenu,
  ancestorResNums = [resNum],
  threadKey,
}) => {
  if (depth >= MAX_TREE_DEPTH) return null;
  const replies = repIndex.get(resNum);
  if (!replies || replies.size === 0) return null;

  const validReplies = Array.from(replies)
    .sort((a, b) => a - b)
    .filter((n) => !visited.has(n) && resMap.has(n));

  if (validReplies.length === 0) return null;

  return (
    <div
      className="reply-tree"
      style={{
        marginLeft: depth > 0 ? 12 : 0,
        borderLeft: depth > 0 ? "2px solid rgba(128, 128, 128, 0.3)" : "none",
        paddingLeft: depth > 0 ? 8 : 0,
      }}
    >
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
                messageProtocol={messageProtocol}
                // アンカープレビュー配下で開いた返信ツリーは、その階層を子レスにも引き継ぐ。
                // ここを 0 に戻すと、次のアンカーホバーで親プレビューごと閉じる回帰が起きる。
                anchorPreviewDepth={anchorPreviewDepth}
                repIndex={repIndex}
                idIndex={idIndex}
                onUrlClick={onUrlClick}
                onUrlContextMenu={onUrlContextMenu}
                onLinkMiddleClickStart={onLinkMiddleClickStart}
                onIdLinkClick={onIdLinkClick}
                onRepClick={onRepClick}
                onAnchorClick={onAnchorClick}
                onAnchorHover={onAnchorHover}
                onAnchorLeave={onAnchorLeave}
                onContextMenu={onResContextMenu}
                isImageBlurred={blurredResNums?.has(res.num)}
                ngResNums={ngResNums}
                threadKey={threadKey}
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
            <ReplyTree
              resNum={replyNum}
              repIndex={repIndex}
              idIndex={idIndex}
              resMap={resMap}
              messageProtocol={messageProtocol}
              anchorPreviewDepth={anchorPreviewDepth}
              onUrlClick={onUrlClick}
              onUrlContextMenu={onUrlContextMenu}
              onLinkMiddleClickStart={onLinkMiddleClickStart}
              onIdLinkClick={onIdLinkClick}
              onRepClick={onRepClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onResContextMenu={onResContextMenu}
              visited={visited}
              depth={depth + 1}
              blurredResNums={blurredResNums}
              ngResNums={ngResNums}
              threadKey={threadKey}
              onSubTreeMenu={onSubTreeMenu}
              ancestorResNums={[...ancestorResNums, replyNum]}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
