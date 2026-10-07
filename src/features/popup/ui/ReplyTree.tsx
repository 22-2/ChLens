import { MoreVertical } from "lucide-react";
import React from "react";
import type { SubTreeMenuClickHandler } from "src/features/popup/browser/use-reply-tree-menus";
import { PopupResCard } from "src/features/popup/ui/PopupResCard";
import type { IRes } from "src/service-container";
import { MAX_TREE_DEPTH } from "src/view/browser/utils/constants";
import type { UrlClickHandler, UrlContextMenuHandler } from "src/view/browser/utils/link-routing";

export interface ReplyTreeProps {
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
  /** ポップアップ内でも画像ぼかしを適用するためのセット */
  blurredResNums?: Set<number>;
  /** ツリー内のアンカー先NG強調にも同じ判定集合を使う。 */
  ngResNums?: ReadonlySet<number>;
  ownResNums?: ReadonlySet<number>;
  replyToOwnResNums?: ReadonlySet<number>;
  /** hard-ngの返信もクリック式プレースホルダーとしてツリーへ残す。 */
  allowHardNgReveal?: boolean;
  /** 個別ツリーの三点メニュークリック時コールバック（渡された場合のみボタン表示） */
  onSubTreeMenu?: SubTreeMenuClickHandler;
  threadKey?: string;
}

/** 再帰しても変わらない、ツリー全体で共有する props。 */
type ReplyTreeSharedProps = Omit<ReplyTreeProps, "resNum">;

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

// 変更理由: 以前は20個以上の props を再帰のたびに1つずつ書き写しており、
// 渡し忘れ（ownResNums など）が起きやすかった。共有 props を1つにまとめて引き継ぎ、
// 再帰ごとに変わる値（resNum、depth、経路）だけを個別に渡す。
const ReplyTreeBranch: React.FC<ReplyTreeBranchProps> = ({
  shared,
  resNum,
  depth,
  visited,
  ancestorResNums,
}) => {
  const {
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
    blurredResNums,
    ngResNums,
    ownResNums,
    replyToOwnResNums,
    allowHardNgReveal = false,
    onSubTreeMenu,
    threadKey,
  } = shared;

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
                isOwn={ownResNums?.has(res.num)}
                isReplyToOwn={replyToOwnResNums?.has(res.num)}
                resMap={resMap}
                threadKey={threadKey}
                allowHardNgReveal={allowHardNgReveal}
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
