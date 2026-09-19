import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import React, { useCallback, useState } from "react";
import { TabContextMenu } from "src/view/browser/components/TabContextMenu";
import { useTabBarOrientation } from "src/view/browser/hooks/use-tab-bar-orientation";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useTitleBarNavigationEnabled } from "src/view/browser/hooks/use-title-bar-navigation-setting";
import { canGoBack, canGoForward } from "src/view/browser/types";
import { isPageRefreshable } from "src/view/browser/utils/refreshable-pages";

interface TitleBarMenuPosition {
  x: number;
  y: number;
}

export const TitleBar: React.FC = () => {
  const { activeTab, currentPage, dispatch, paneId } = useTabStore();
  const title = currentPage.title || "read.crx 2";
  const tabBarOrientation = useTabBarOrientation();
  const showTitleBarNavigation = useTitleBarNavigationEnabled();
  // 変更理由: 垂直モードでは更新ボタンをタイトルバー左端に置き、タブバーの上部を空ける。
  // 水平モードではタブバー側に更新があるため左端は空のまま中央配置を保つ。
  const showLeadingRefresh = tabBarOrientation === "vertical";
  // 変更理由: 履歴移動はタブごとの状態に依存するため、タイトルバーの共通表示でも
  // アクティブタブの履歴だけを参照し、無効な操作を見た目と実動作で一致させる。
  const showLeadingNavigation = showLeadingRefresh && showTitleBarNavigation;
  const canNavigateBack = canGoBack(activeTab);
  const canNavigateForward = canGoForward(activeTab);
  const canRefresh = isPageRefreshable(currentPage);
  const [menuPosition, setMenuPosition] = useState<TitleBarMenuPosition | null>(null);

  const handleTitleContextMenu = useCallback((e: React.MouseEvent) => {
    // 変更理由: タイトルバーのタイトル右クリックでは、タブを右クリックした時と同じ
    // メニューを出し、タブ操作の導線をタイトルバーからも利用できるようにする。
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenuPosition(null), []);

  return (
    <header className="title-bar" data-testid="title-bar">
      <div className="title-bar__leading" data-testid="title-bar-leading">
        {showLeadingNavigation && (
          <>
            <button
              type="button"
              className="title-bar__navigation"
              disabled={!canNavigateBack}
              onClick={() => dispatch({ type: "GO_BACK" })}
              title="戻る"
              aria-label="戻る"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              className="title-bar__navigation"
              disabled={!canNavigateForward}
              onClick={() => dispatch({ type: "GO_FORWARD" })}
              title="進む"
              aria-label="進む"
            >
              <ArrowRight size={14} />
            </button>
          </>
        )}
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
        onContextMenu={handleTitleContextMenu}
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
      {menuPosition && (
        <TabContextMenu tab={activeTab} position={menuPosition} onClose={closeMenu} />
      )}
    </header>
  );
};
