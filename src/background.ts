import browser from "webextension-polyfill";

const isTabReadcrx = (tab: browser.Tabs.Tab) =>
  tab.url?.startsWith(browser.runtime.getURL(""));
const NEW_UI_URL_PREFIX = browser.runtime.getURL("view/browser.html");
let newUiPrimaryTabId: number | null = null;

const isNewUiTab = (tab: browser.Tabs.Tab | undefined): boolean =>
  typeof tab?.url === "string" && tab.url.startsWith(NEW_UI_URL_PREFIX);

const focusTabById = async (tabId: number): Promise<void> => {
  const tab = await browser.tabs.get(tabId);
  await browser.windows.update(tab.windowId!, { focused: true });
  await browser.tabs.update(tab.id!, { active: true });
};

browser.tabs.onRemoved.addListener((tabId: number) => {
  if (newUiPrimaryTabId === tabId) {
    newUiPrimaryTabId = null;
  }
});

browser.tabs.onUpdated.addListener(
  async (tabId: number, changeInfo, tab: browser.Tabs.Tab) => {
    if (changeInfo.status !== "complete" || !isNewUiTab(tab)) {
      return;
    }

    // new-uiは単一インスタンスに制限し、タブ間での状態競合を防ぐ。
    if (newUiPrimaryTabId == null || newUiPrimaryTabId === tabId) {
      newUiPrimaryTabId = tabId;
      return;
    }

    try {
      await focusTabById(newUiPrimaryTabId);
      await browser.tabs.remove(tabId);
    } catch {
      // primaryが既に閉じられていたら現在タブをprimaryとして採用する。
      newUiPrimaryTabId = tabId;
    }
  },
);

// 実行中のread.crxを探す
const searchRcrx = async () => {
  const tabs = await browser.tabs.query({
    url: browser.runtime.getURL("*"),
  });
  if (tabs.length === 0) {
    return null;
  }
  return tabs[0];
};

// アイコンクリック時の動作
const browserAction =
  typeof browser !== "undefined" && navigator.userAgent.includes("Firefox")
    ? browser.browserAction
    : browser.action;
browserAction.onClicked.addListener(async (currentTab) => {
  // 現在のタブが自分自身なら何もしない
  if (isTabReadcrx(currentTab)) {
    return;
  }

  const rcrx = await searchRcrx();
  if (rcrx != null) {
    // 実行中のread.crxが存在すればそれを開く
    browser.windows.update(rcrx.windowId!, { focused: true });
    browser.tabs.update(rcrx.id!, { active: true });
  } else {
    // 存在しなければタブを作成する
    browser.tabs.create({ url: "view/index.html" });
  }
});
