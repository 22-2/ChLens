import "src/view/browser/styles/pages/thread/ResReplyPreview.css";

import { Image as ImageIcon } from "lucide-react";
import React from "react";
import type { ReplyPreview } from "src/view/browser/utils/reply-preview";

interface ResReplyPreviewProps {
  preview: ReplyPreview;
  onClick: (resNum: number) => void;
}

/** 返信先レスの本文の冒頭を1行で示す。押すと返信先へ移動する。 */
export const ResReplyPreview: React.FC<ResReplyPreviewProps> = ({ preview, onClick }) => (
  <button
    type="button"
    className="res__reply-preview"
    aria-label={`返信先レス${preview.num}へ移動`}
    onClick={(event) => {
      event.stopPropagation();
      onClick(preview.num);
    }}
  >
    <span className="res__reply-preview-text">{preview.text}</span>
    {preview.hasImage ? (
      <ImageIcon className="res__reply-preview-image" size={14} aria-label="画像あり" />
    ) : null}
  </button>
);
