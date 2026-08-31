import { RotateCw } from "lucide-react";
import { useState } from "react";
import { LiveBrowserShell, type LiveTab } from "./LiveBrowserShell";
import { LiveThreadList } from "./LiveThreadList";
import { ThreadView } from "./ThreadView";

const initialTabs: LiveTab[] = [
  { id: "board", title: "ニュース速報", page: "threadList", url: "https://example.com/news/" },
  { id: "thread", title: "実況スレ ★1", page: "thread", url: "https://example.com/news/123" },
];

const rows = [
  { id: "thread-1", num: 1, title: "実況スレ ★1", resCount: 120, heat: 14.2 },
  { id: "thread-2", num: 2, title: "雑談スレ", resCount: 45, heat: 5.1 },
];

const posts = [
  { number: 1, name: "名無し", mail: "", date: "2026/08/29", id: "abc123", message: "配信開始" },
  { number: 2, name: "名無し", mail: "", date: "2026/08/29", id: "def456", message: ">>1 きた" },
];

export default { title: "Live/LiveBrowserShell" };

export function Default() {
  const [tabs, setTabs] = useState(initialTabs);
  const [activeTabId, setActiveTabId] = useState(initialTabs[0].id);
  const [address, setAddress] = useState(initialTabs[0].url);
  const [activePage, setActivePage] = useState<LiveTab["page"]>(initialTabs[0].page);

  return (
    <LiveBrowserShell
      tabs={tabs}
      activeTabId={activeTabId}
      address={address}
      onAddressChange={setAddress}
      onAddressSubmit={() => undefined}
      onSelectTab={(tabId) => {
        const nextTab = tabs.find((tab) => tab.id === tabId);
        if (nextTab) setActivePage(nextTab.page);
        setActiveTabId(tabId);
        setAddress(nextTab?.url ?? "");
      }}
      onCloseTab={(tabId) => setTabs((current) => current.filter((tab) => tab.id !== tabId))}
      primaryAction={{ label: "更新", icon: <RotateCw size={16} />, onClick: () => undefined }}
      toolbar={null}
    >
      {activePage === "threadList" ? (
        <LiveThreadList
          rows={rows}
          loading={false}
          error={null}
          query=""
          onQueryChange={() => undefined}
          filterOpen={false}
          onFilterClose={() => undefined}
          sortColumn={null}
          sortDirection="asc"
          onSort={() => undefined}
          onSelect={() => undefined}
          onMiddleClick={() => undefined}
        />
      ) : (
        <ThreadView posts={posts} error={null} onRefresh={() => undefined} />
      )}
    </LiveBrowserShell>
  );
}
