import type { ReactNode } from "react";

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
  toolbar,
  children,
}: LiveBrowserShellProps): React.ReactElement {
  return (
    <main className="live-browser-shell">
      <nav className="live-tab-bar" aria-label="開いているタブ">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTabId ? "live-tab live-tab--active" : "live-tab"}
            aria-current={tab.id === activeTabId ? "page" : undefined}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="live-tab__title">{tab.title}</span>
            {tabs.length > 1 && (
              <span
                className="live-tab__close"
                role="button"
                tabIndex={0}
                aria-label={`${tab.title}を閉じる`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
      </nav>

      <form
        className="live-url-bar"
        onSubmit={(event) => {
          event.preventDefault();
          onAddressSubmit();
        }}
      >
        <label className="live-url-bar__label" htmlFor="live-address">
          URL
        </label>
        <input
          id="live-address"
          value={address}
          onChange={(event) => onAddressChange(event.target.value)}
          aria-label="URL"
        />
        <button type="submit">開く</button>
        <div className="live-url-bar__actions">{toolbar}</div>
      </form>

      <section className="live-content-area" aria-label="コンテンツエリア">
        {children}
      </section>
    </main>
  );
}
