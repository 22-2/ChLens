import normalizeWheel from "normalize-wheel";
import { RotateCw, X } from "lucide-react";
import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useWheelPagination, WHEEL_THRESHOLD } from "src/view/browser/hooks/useWheelPagination";
import { WheelScrollIndicator } from "src/view/browser/components/WheelScrollIndicator";

export type LivePage = "threadList" | "thread";

export interface LiveTab {
  id: string;
  title: string;
  page: LivePage;
  url: string;
}

interface LiveBrowserShellProps {
  tabs: readonly LiveTab[];
  activeTabId: string;
  address: string;
  onAddressChange: (value: string) => void;
  onAddressSubmit: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  primaryAction?: { label: string; icon?: ReactNode; disabled?: boolean; onClick: () => void };
  wheelRefresh?: () => void;
  wheelLoading?: boolean;
  wheelEdge?: "top" | "bottom";
  threadAutoRefreshState?: "active" | "inactive" | null;
  toolbar: ReactNode;
  children: ReactNode;
}

/** Chlensと同じ、タブ・常時表示URLバー・単一コンテンツ領域のMain shell。 */
export function LiveBrowserShell({
  tabs,
  activeTabId,
  address,
  onAddressChange,
  onAddressSubmit,
  onSelectTab,
  onCloseTab,
  primaryAction,
  wheelRefresh,
  wheelLoading = false,
  wheelEdge = "top",
  threadAutoRefreshState = null,
  toolbar,
  children,
}: LiveBrowserShellProps): ReactElement {
  const contentPanelRef = useRef<HTMLDivElement>(null);
  const lastWheelSwitchAtRef = useRef(0);
  const wheelPagination = useWheelPagination({
    isEnabled: wheelRefresh != null,
    isLoading: wheelLoading,
    containerRef: contentPanelRef,
    edge: wheelEdge,
    // 変更理由: 更新処理をshellから直接実装せず、一覧/スレッドのsession操作を呼び出し側へ
    // 渡すことで、ChLensと同じジェスチャー表示をLiveの取得方式へ接続する。
    onRefresh: wheelRefresh ?? (() => undefined),
  });

  const handleTabWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      if (tabs.length < 2) return;

      const normalizedWheel = normalizeWheel(event.nativeEvent);
      const wheelDistance = normalizedWheel.pixelX + normalizedWheel.pixelY;
      if (Math.abs(wheelDistance) < 1.5) return;

      const now = Date.now();
      const cooldownMs = Math.max(
        0,
        150 - 2 * (Math.abs(normalizedWheel.pixelX) + Math.abs(normalizedWheel.pixelY)),
      );
      if (now - lastWheelSwitchAtRef.current < cooldownMs) return;

      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
      if (currentIndex === -1) return;

      // 変更理由: normalize-wheel後の符号だけを使い、OSや入力デバイスごとのdelta差を
      // Live側で再解釈しない。ChLensのTabBarと同じ向きでタブを循環させる。
      const delta = wheelDistance > 0 ? 1 : -1;
      const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
      event.preventDefault();
      lastWheelSwitchAtRef.current = now;
      onSelectTab(tabs[nextIndex].id);
    },
    [activeTabId, onSelectTab, tabs],
  );

  const handleTabMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, tabId: string) => {
      if (event.button !== 1) return;

      // 変更理由: ChLensでは中クリックを「新しいタブで開く」ではなく、現在のタブを
      // 閉じる操作に割り当てているため、Liveの簡易タブにも同じ操作契約を適用する。
      event.preventDefault();
      onCloseTab(tabId);
    },
    [onCloseTab],
  );

  return (
    <main className="live-browser-shell browser-shell" data-theme="dark">
      <div className="pane-row live-pane-row">
        <section className="pane-column live-pane-column" data-active="true">
          <div className="pane-column__chrome live-pane-column__chrome">
            <nav
              className="tab-bar live-tab-bar"
              aria-label="開いているタブ"
              onWheel={handleTabWheel}
            >
              <button
                type="button"
                className="tab-bar__refresh"
                disabled={!primaryAction || primaryAction.disabled}
                aria-label={primaryAction?.label ?? "操作不可"}
                title={primaryAction?.label}
                onClick={primaryAction?.onClick}
              >
                {primaryAction?.icon ?? <RotateCw size={16} />}
              </button>
              <span className="tab-bar__refresh-divider" aria-hidden="true" />
              <div className="tab-list-container">
                <div className="tab-list">
                  {tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={
                        tab.id === activeTabId ? "tab live-tab tab--active" : "tab live-tab"
                      }
                      data-tab-id={tab.id}
                      onClick={() => onSelectTab(tab.id)}
                      onMouseDown={(event) => handleTabMouseDown(event, tab.id)}
                    >
                      {tab.page === "thread" ? (
                        <span
                          className={`tab__auto-refresh-indicator${
                            tab.id !== activeTabId || threadAutoRefreshState !== "active"
                              ? " tab__auto-refresh-indicator--inactive"
                              : ""
                          }`}
                          title={
                            tab.id === activeTabId && threadAutoRefreshState === "active"
                              ? "自動更新: 動作中"
                              : "自動更新: 待機中"
                          }
                          aria-label={
                            tab.id === activeTabId && threadAutoRefreshState === "active"
                              ? "自動更新動作中"
                              : "自動更新待機中"
                          }
                        />
                      ) : null}
                      <span className="tab__title live-tab__title">{tab.title}</span>
                      {tabs.length > 1 && (
                        <button
                          type="button"
                          className="tab__close live-tab__close"
                          aria-label={`${tab.title}を閉じる`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onCloseTab(tab.id);
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </nav>

            <form
              className="nav-bar live-url-bar"
              onSubmit={(event) => {
                event.preventDefault();
                onAddressSubmit();
              }}
            >
              <div className="nav-bar__url live-url-bar__url">
                <input
                  id="live-address"
                  className="nav-bar__url-input"
                  value={address}
                  onChange={(event) => onAddressChange(event.target.value)}
                  aria-label="URL"
                />
              </div>
              <div className="live-url-bar__actions">{toolbar}</div>
            </form>
          </div>

          <section className="content-area live-content-area" aria-label="コンテンツエリア">
            <div ref={contentPanelRef} className="content-area__tab-panel live-content-area__panel">
              <WheelScrollIndicator
                {...wheelPagination}
                threshold={WHEEL_THRESHOLD}
                portalContainerRef={contentPanelRef}
              />
              {children}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
