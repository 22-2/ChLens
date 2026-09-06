import { RotateCw } from "lucide-react";
import React from "react";
import { useTabBarOrientation } from "src/view/browser/hooks/use-tab-bar-orientation";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

export const TitleBar: React.FC = () => {
  const { currentPage, dispatch, paneId } = useTabStore();
  const title = currentPage.title || "read.crx 2";
  // 変更理由: 垂直モードでは更新ボタンをタイトルバー左端に置き、タブバーの上部を空ける。
  // 水平モードではタブバー側に更新があるため左端は空のまま中央配置を保つ。
  const showLeadingRefresh = useTabBarOrientation() === "vertical";
  const canRefresh = isPageRefreshable(currentPage);

  return (
    <header className="title-bar" data-testid="title-bar">
      <div className="title-bar__leading" data-testid="title-bar-leading">
        {showLeadingRefresh && (
          <button
            type="button"
            className="title-bar__refresh"
            disabled={!canRefresh}
            onClick={() => dispatch({ type: "RELOAD" })}
            title="更新"
            aria-label="更新"
          >
            <RotateCw size={14} />
          </button>
        )}
      </div>
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
        {/* 変更理由: 垂直モードではアクティブペインではなく自ペインの NavigationBar が
            ここへポータルする。ペイン単位の data-pane-id で描画先を区別する。 */}
        <div
          className="title-bar__nav-slot"
          data-pane-id={paneId}
          data-testid="title-bar-nav-slot"
        />
        {/* 変更理由: ペイン分割はコマンドパレットから操作するため、タイトルバーの
            専用ボタンは置かない。長いタイトルで右端が圧迫される問題も避ける。 */}
      </div>
    </header>
  );
};
