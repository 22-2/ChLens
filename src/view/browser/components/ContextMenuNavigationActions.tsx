import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import React from "react";

interface ContextMenuNavigationActionsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  canRefresh: boolean;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
}

/** Windows 11のコンテキストメニュー上段に合わせた、ラベルなしの操作アイコン列。 */
export const ContextMenuNavigationActions: React.FC<ContextMenuNavigationActionsProps> = ({
  canGoBack,
  canGoForward,
  canRefresh,
  onBack,
  onForward,
  onRefresh,
}) => (
  <div className="context-menu__header-actions" role="group" aria-label="ナビゲーション操作">
    <button
      type="button"
      className="context-menu__header-action"
      disabled={!canGoBack}
      onClick={onBack}
      title="戻る"
      aria-label="戻る"
    >
      <ArrowLeft size={18} />
    </button>
    <button
      type="button"
      className="context-menu__header-action"
      disabled={!canGoForward}
      onClick={onForward}
      title="進む"
      aria-label="進む"
    >
      <ArrowRight size={18} />
    </button>
    <button
      type="button"
      className="context-menu__header-action"
      disabled={!canRefresh}
      onClick={onRefresh}
      title="更新"
      aria-label="更新"
    >
      <RotateCw size={18} />
    </button>
  </div>
);
