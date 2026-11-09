import "src/view/browser/styles/pages/thread/ResReplyPreview.css";

import { Image as ImageIcon } from "lucide-react";
import React from "react";
import type { IRes } from "src/service-container";
import type { ReplyPreview } from "src/view/browser/utils/reply-preview";

interface ResReplyPreviewProps {
  preview: ReplyPreview;
  onClick: (resNum: number, event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent, res: IRes) => void;
}

/** 返信先レスの本文の冒頭を1行で示す。押すと返信先のポップアップを開き、右クリックで返信先レスのメニューを開く。 */
export const ResReplyPreview: React.FC<ResReplyPreviewProps> = ({
  preview,
  onClick,
  onContextMenu,
}) => (
  <button
    type="button"
    className="res__reply-preview"
    aria-label={`返信先レス${preview.num}を表示`}
    onClick={(event) => {
      event.stopPropagation();
      onClick(preview.num, event);
    }}
    onContextMenu={(event) => {
      // 変更理由: 親のレスのメニューではなく、プレビューが示す返信先レスのメニューを開く。
      event.preventDefault();
      event.stopPropagation();
      onContextMenu(event, preview.res);
    }}
  >
    <span className="res__reply-preview-text">{preview.text}</span>
    {preview.hasImage ? (
      <ImageIcon className="res__reply-preview-image" size={14} aria-label="画像あり" />
    ) : null}
  </button>
);
