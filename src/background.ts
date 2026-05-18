import browser from "webextension-polyfill";

const NEW_UI_URL_PREFIX = browser.runtime.getURL("view/browser.html");
const NEW_UI_URL_QUERY = `${browser.runtime.getURL("view/browser.html")}*`;
let newUiPrimaryTabId: number | null = null;

type OpenNewUiMessage = {
  type: "open-new-ui";
  url: string;
};

type OpenInNewViewerTabMessage = {
  type: "open-in-new-viewer-tab";
  url: string;
};

// 指定されたタブがこの拡張機能のUIかどうか判定
const isNewUiTab = (tab: browser.Tabs.Tab | undefined): boolean =>
  typeof tab?.url === "string" && tab.url.startsWith(NEW_UI_URL_PREFIX);

// 既存のread.crx UIタブを探す
const findNewUiTab = async (): Promise<browser.Tabs.Tab | null> => {
  const tabs = await browser.tabs.query({ url: NEW_UI_URL_QUERY });
  if (tabs.length === 0) return null;

  // 保存されているIDと一致するタブがあれば優先
  if (newUiPrimaryTabId != null) {
    const primaryTab = tabs.find((tab) => tab.id === newUiPrimaryTabId);
    if (primaryTab) return primaryTab;
  }
  return tabs[0];
};

const focusTabById = async (tabId: number): Promise<void> => {
  const tab = await browser.tabs.get(tabId);
  if (tab.windowId != null) {
    await browser.windows.update(tab.windowId, { focused: true });
  }
  await browser.tabs.update(tabId, { active: true });
};

// URLを開く、または既存のタブを更新してフォーカスする（唯一の入り口）
const openOrFocusNewUiTab = async (currentUrl?: string): Promise<void> => {
  const existingTab = await findNewUiTab();
  const viewerUrl = currentUrl
    ? `${NEW_UI_URL_PREFIX}?q=${encodeURIComponent(currentUrl)}`
    : NEW_UI_URL_PREFIX;

  if (existingTab?.id != null) {
    // 既存タブがある場合：URLを更新してフォーカス
    await browser.tabs.update(existingTab.id, {
      url: viewerUrl,
      active: true,
    });
    await focusTabById(existingTab.id);
    newUiPrimaryTabId = existingTab.id;
  } else {
    // 既存タブがない場合：新規作成
    const createdTab = await browser.tabs.create({
      url: viewerUrl,
      active: true,
    });
    if (createdTab.id != null) {
      newUiPrimaryTabId = createdTab.id;
    }
  }
};

/**
 * 強制的な単一インスタンス管理ロジック
 * 他のスクリプトや手入力で新しいタブが開かれた場合に対処
 */
const enforceSingleInstance = async (tab: browser.Tabs.Tab) => {
  if (!isNewUiTab(tab) || tab.id === undefined) return;

  const existingTab = await findNewUiTab();

  // 自分自身が唯一のインスタンスならそれをプライマリにする
  if (!existingTab || existingTab.id === tab.id) {
    newUiPrimaryTabId = tab.id;
    return;
  }

  // 他に既にタブが存在する場合：
  // 1. 既存のタブにフォーカス
  await focusTabById(existingTab.id!);
  // 2. 新しく作られた方のタブを閉じる
  await browser.tabs.remove(tab.id);
};

// タブが作成された瞬間
browser.tabs.onCreated.addListener((tab) => {
  void enforceSingleInstance(tab);
});

// タブのURLが更新された瞬間（アドレスバーからの入力等に対応）
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "loading") {
    void enforceSingleInstance(tab);
  }
});

// タブが閉じられた時のクリーンアップ
browser.tabs.onRemoved.addListener((tabId: number) => {
  if (newUiPrimaryTabId === tabId) {
    newUiPrimaryTabId = null;
  }
});

// 既存ビューアータブへ新しい専ブラタブで開くよう指示する。タブがなければ新規作成する。
const openInNewViewerTab = async (currentUrl: string): Promise<void> => {
  const existingTab = await findNewUiTab();
  const viewerUrl = `${NEW_UI_URL_PREFIX}?q=${encodeURIComponent(currentUrl)}`;

  if (existingTab?.id != null) {
    // 変更理由: タブのURLを上書きするとビューアーがリロードされ既存の専ブラタブが消えるため、
    // sendMessage でビューアー側に新タブ追加を委譲する。
    await browser.tabs.sendMessage(existingTab.id, {
      type: "open-tab-in-viewer",
      url: currentUrl,
    });
    await focusTabById(existingTab.id);
  } else {
    const createdTab = await browser.tabs.create({ url: viewerUrl, active: true });
    if (createdTab.id != null) {
      newUiPrimaryTabId = createdTab.id;
    }
  }
};

// メッセージ経由の起動
browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as OpenNewUiMessage | OpenInNewViewerTabMessage;
  if (msg.type === "open-new-ui") {
    void openOrFocusNewUiTab(msg.url);
  } else if (msg.type === "open-in-new-viewer-tab") {
    void openInNewViewerTab(msg.url);
  }
});

// ツールバーアイコンクリック時の動作
browser.action.onClicked.addListener(async (currentTab) => {
  // 現在のタブが既にread.crxなら何もしない
  if (isNewUiTab(currentTab)) return;

  // 現在のページURLを渡して開く（URLがない場合はトップを開く）
  const urlToOpen = (typeof currentTab.url === "string" && currentTab.url.startsWith("http"))
    ? currentTab.url
    : undefined;

  await openOrFocusNewUiTab(urlToOpen);
});
