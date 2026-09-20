import { type FC } from "react";
import { TabPanel } from "src/view/browser/components/TabView";
import { useDetachedTabs } from "src/view/browser/hooks/detached-tab-context";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import type { Tab } from "src/view/browser/types";

interface ContentAreaProps {
  isOverlayTarget?: boolean;
}

/**
 * 現在のペインに属するタブ一覧の配置だけを担当する。
 *
 * 変更理由: タブ本体の描画と一覧の配置を分けることで、別窓用の表示ホストを追加しても
 * ページ選択・再マウント・スクロール領域の規則を二重実装せずに済む。
 */
export const ContentArea: FC<ContentAreaProps> = ({ isOverlayTarget = true }) => {
  const { state } = useTabStore();
  const { isDetached, focusTab, closeTab } = useDetachedTabs();

  return (
    <div className="content-area">
      {state.tabs.map((tab) => {
        const detached = isDetached(tab.id);
        if (detached) {
          return (
            <DetachedTabPlaceholder
              key={tab.id}
              tab={tab}
              isActive={tab.id === state.activeTabId}
              onFocus={() => focusTab(tab.id)}
              onClose={() => closeTab(tab.id)}
            />
          );
        }

        return (
          // 変更理由: 2ペイン時はフォーカス外のペインも表示中のため、自動更新の
          // 実行判定はペイン単位の activeTab で行いフォーカスでは絞らない。
          // 非表示タブ・ドキュメント非表示時の停止は各ページ側の判定に任せる。
          <TabPanel
            key={tab.id}
            tab={tab}
            isActive={tab.id === state.activeTabId}
            isOverlayTarget={isOverlayTarget}
          />
        );
      })}
    </div>
  );
};

const DetachedTabPlaceholder: FC<{
  tab: Tab;
  isActive: boolean;
  onFocus: () => void;
  onClose: () => void;
}> = ({ tab, isActive, onFocus, onClose }) => (
  <div
    className="content-area__detached-placeholder"
    data-active={isActive ? "true" : "false"}
    data-tab-panel-id={tab.id}
    aria-hidden={!isActive}
  >
    {isActive && (
      <>
        <p>このタブは別窓で表示しています。</p>
        <div className="content-area__detached-placeholder-actions">
          <button type="button" onClick={onFocus}>
            別窓を表示
          </button>
          <button type="button" onClick={onClose}>
            別窓を閉じる
          </button>
        </div>
      </>
    )}
  </div>
);
