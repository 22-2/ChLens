import { Columns2 } from "lucide-react";
import React, { useCallback } from "react";
import { useTabPanes, useTabStore } from "src/view/browser/hooks/use-tab-store";

export const TitleBar: React.FC = () => {
  const { currentPage, dispatch } = useTabStore();
  const { panes } = useTabPanes();
  const isTwoPane = panes.length >= 2;
  const title = currentPage.title || "read.crx 2";

  const handleTogglePane = useCallback(() => {
    // 変更理由: ペイン操作は表示カスタマイズの影響を受けない必須操作として、
    // 常にこの共通タイトルバーから利用できるようにする。
    dispatch({ type: isTwoPane ? "CLOSE_PANE" : "SPLIT_PANE" });
  }, [dispatch, isTwoPane]);

  return (
    <header className="title-bar" data-testid="title-bar">
      <div
        className="title-bar__title"
        data-testid="title-bar-title"
        data-page-type={currentPage.type}
        title={title}
      >
        {title}
      </div>
      <div
        className="title-bar__actions action-toolbar-container"
        role="toolbar"
        aria-label="レイアウト操作"
      >
        <button
          type="button"
          className={`title-bar__layout-toggle${isTwoPane ? " title-bar__layout-toggle--active" : ""}`}
          title={isTwoPane ? "2ペイン表示を解除" : "2ペインで表示"}
          aria-label={isTwoPane ? "2ペイン表示を解除" : "2ペインで表示"}
          aria-pressed={isTwoPane}
          onClick={handleTogglePane}
        >
          <Columns2 size={16} />
        </button>
      </div>
    </header>
  );
};
