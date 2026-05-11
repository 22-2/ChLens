import browser from "webextension-polyfill";

const isTabReadcrx = (tab: browser.Tabs.Tab) =>
  tab.url?.startsWith(browser.runtime.getURL(""));
const NEW_UI_URL_PREFIX = browser.runtime.getURL("view/browser.html");
const NEW_UI_URL_QUERY = `${browser.runtime.getURL("view/browser.html")}*`;
let newUiPrimaryTabId: number | null = null;

type OpenNewUiMessage = {
  type: "open-new-ui";
  url: string;
};

const isNewUiTab = (tab: browser.Tabs.Tab | undefined): boolean =>
  typeof tab?.url === "string" && tab.url.startsWith(NEW_UI_URL_PREFIX);

const focusTabById = async (tabId: number): Promise<void> => {
  const tab = await browser.tabs.get(tabId);
  await browser.windows.update(tab.windowId!, { focused: true });
  await browser.tabs.update(tab.id!, { active: true });
};

const createNewUiUrl = (currentUrl: string): string =>
  `${browser.runtime.getURL("view/browser.html")}?q=${encodeURIComponent(currentUrl)}`;

const findNewUiTab = async (): Promise<browser.Tabs.Tab | null> => {
  const tabs = await browser.tabs.query({ url: NEW_UI_URL_QUERY });
  if (tabs.length === 0) {
    return null;
  }

  if (newUiPrimaryTabId != null) {
    const primaryTab = tabs.find((tab) => tab.id === newUiPrimaryTabId);
    if (primaryTab) {
      return primaryTab;
    }
  }

  return tabs[0] ?? null;
};

const openOrFocusNewUiTab = async (currentUrl: string): Promise<void> => {
  const viewerUrl = createNewUiUrl(currentUrl);
  const existingTab = await findNewUiTab();

  if (existingTab?.id != null) {
    // 変更理由: new-ui は単一インスタンス運用なので、既存タブがある場合は
    // URL を差し替えて「現在のタブ」をそのまま表示し直す。
    await browser.tabs.update(existingTab.id, {
      url: viewerUrl,
      active: true,
    });
    if (existingTab.windowId != null) {
      await browser.windows.update(existingTab.windowId, { focused: true });
    }
    newUiPrimaryTabId = existingTab.id;
    return;
  }

  const createdTab = await browser.tabs.create({
    url: viewerUrl,
    active: true,
  });
  if (createdTab.id != null) {
    newUiPrimaryTabId = createdTab.id;
  }
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

browser.runtime.onMessage.addListener((message: OpenNewUiMessage) => {
  if (message.type !== "open-new-ui") {
    return;
  }

  void openOrFocusNewUiTab(message.url);
});

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

  if (typeof currentTab.url === "string" && currentTab.url.length > 0) {
    await openOrFocusNewUiTab(currentTab.url);
    return;
  }

  const rcrx = await searchRcrx();
  if (rcrx != null) {
    // 実行中のread.crxが存在すればそれを開く
    browser.windows.update(rcrx.windowId!, { focused: true });
    browser.tabs.update(rcrx.id!, { active: true });
  } else {
    // 存在しなければタブを作成する
    browser.tabs.create({ url: "view/browser.html" });
  }
});
