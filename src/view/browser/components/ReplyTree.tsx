import React from "react";
import type { IRes } from "src/service-container";
import { MAX_TREE_DEPTH } from "src/view/browser/utils/constants";
import { PopupResCard } from "src/view/browser/components/PopupResCard";

// --- 再帰的返信ツリー ---
export const ReplyTree: React.FC<{
  resNum: number;
  repIndex: Map<number, Set<number>>;
  resMap: Map<number, IRes>;
  messageProtocol: string;
  onUrlClick: (url: string, resImages?: string[]) => void;
  onRepClick: (resNum: number, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
  onResContextMenu: (e: React.MouseEvent, res: IRes) => void;
  visited: Set<number>;
  depth: number;
}> = ({
  resNum,
  repIndex,
  resMap,
  messageProtocol,
  onUrlClick,
  onRepClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  onResContextMenu,
  visited,
  depth,
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
        return (
          <React.Fragment key={replyNum}>
            <PopupResCard
              res={res}
              messageProtocol={messageProtocol}
              anchorPreviewDepth={0}
              repIndex={repIndex}
              onUrlClick={onUrlClick}
              onRepClick={onRepClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onContextMenu={onResContextMenu}
            />
            <ReplyTree
              resNum={replyNum}
              repIndex={repIndex}
              resMap={resMap}
              messageProtocol={messageProtocol}
              onUrlClick={onUrlClick}
              onRepClick={onRepClick}
              onAnchorClick={onAnchorClick}
              onAnchorHover={onAnchorHover}
              onAnchorLeave={onAnchorLeave}
              onResContextMenu={onResContextMenu}
              visited={visited}
              depth={depth + 1}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
};
