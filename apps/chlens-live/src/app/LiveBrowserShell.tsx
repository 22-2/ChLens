import type { ReactNode } from "react";
import { RotateCw, X } from "lucide-react";

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
  toolbar,
  children,
}: LiveBrowserShellProps): React.ReactElement {
  return (
    <main className="live-browser-shell browser-shell" data-theme="dark">
      <div className="pane-row live-pane-row">
        <section className="pane-column live-pane-column" data-active="true">
          <div className="pane-column__chrome live-pane-column__chrome">
            <nav className="tab-bar live-tab-bar" aria-label="開いているタブ">
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
                    >
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
            <div className="content-area__tab-panel live-content-area__panel">{children}</div>
          </section>
        </section>
      </div>
    </main>
  );
}
