import { useState } from "react";
import { LiveBrowserShell, type LiveTab } from "./LiveBrowserShell";

const initialTabs: LiveTab[] = [
  { id: "board", title: "ニュース速報", page: "threadList", url: "https://example.com/news/" },
  { id: "thread", title: "実況スレ ★1", page: "thread", url: "https://example.com/news/123" },
];

export default { title: "Live/LiveBrowserShell" };

export function Default() {
  const [tabs, setTabs] = useState(initialTabs);
  const [activeTabId, setActiveTabId] = useState(initialTabs[0].id);
  const [address, setAddress] = useState(initialTabs[0].url);

  return (
    <LiveBrowserShell
      tabs={tabs}
      activeTabId={activeTabId}
      address={address}
      onAddressChange={setAddress}
      onAddressSubmit={() => undefined}
      onSelectTab={(tabId) => {
        setActiveTabId(tabId);
        setAddress(tabs.find((tab) => tab.id === tabId)?.url ?? "");
      }}
      onCloseTab={(tabId) => setTabs((current) => current.filter((tab) => tab.id !== tabId))}
      toolbar={<button type="button">更新</button>}
    >
      <div className="live-reader__placeholder">選択中のページをここに表示</div>
    </LiveBrowserShell>
  );
}
