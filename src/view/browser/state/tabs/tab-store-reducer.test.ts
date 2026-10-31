import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { getAutoRefreshPageKey } from "src/view/browser/state/tabs/auto-refresh-pages";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { createPane, createTabFromPage } from "src/view/browser/state/tabs/tab-store-new-tab";
import { tabReducer } from "src/view/browser/state/tabs/tab-store-reducer";
import type { TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import type { Page, Pane, Tab } from "src/view/browser/types";
import { createBoardPage } from "src/view/browser/utils/tab-pages";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const BOARD_URL = "https://mevius.5ch.io/livegalileo/";

function thread(n: number): Extract<Page, { type: "thread" }> {
  return {
    type: "thread",
    title: `スレ${n}`,
    threadUrl: `https://mevius.5ch.io/test/read.cgi/livegalileo/100000000${n}/`,
  };
}

/** 指定したページを、この順の履歴として持つタブを作る。表示位置は currentIndex で決まる。 */
function createTabWithHistory(pages: Page[], currentIndex = pages.length - 1): Tab {
  return { ...createTabFromPage(pages[0]!), history: pages, currentIndex };
}

/** 1つのペインに、指定したタブを並べた状態を作る。先頭のタブを表示する。 */
function createState(tabs: Tab[]): TabStoreState {
  const pane = createPane(tabs[0]!);
  return {
    panes: [{ ...pane, tabs, activeTabId: tabs[0]!.id }],
    activePaneId: pane.id,
    closedTabs: [],
  };
}

function tabIdsOf(state: TabStoreState): string[] {
  return state.panes[0]!.tabs.map((tab) => tab.id);
}

function activeTabOf(state: TabStoreState): Tab {
  const pane = state.panes[0]!;
  return pane.tabs.find((tab) => tab.id === pane.activeTabId)!;
}

setupTestPageTypes();

describe("タブの並べ替えとピン留め", () => {
  it("ピン留めしたタブは、ほかのタブより前に並ぶ", () => {
    const [a, b, c] = [1, 2, 3].map((n) => createTabWithHistory([thread(n)]));
    const state = createState([a!, b!, c!]);

    const next = tabReducer(state, tabActions.togglePin(c!.id));

    expect(tabIdsOf(next)).toEqual([c!.id, a!.id, b!.id]);
    expect(activeTabOf(next).pinned).toBe(false);
    expect(next.panes[0]!.tabs[0]!.pinned).toBe(true);
  });

  it("同じグループの中でタブを移動すると、移動先の位置に並び替える", () => {
    const [a, b, c] = [1, 2, 3].map((n) => createTabWithHistory([thread(n)]));
    const state = createState([a!, b!, c!]);

    const next = tabReducer(state, tabActions.moveTab(a!.id, 2));

    expect(tabIdsOf(next)).toEqual([b!.id, c!.id, a!.id]);
  });

  it("移動先の位置が範囲外なら、先頭か末尾に収める", () => {
    const [a, b, c] = [1, 2, 3].map((n) => createTabWithHistory([thread(n)]));
    const state = createState([a!, b!, c!]);

    expect(tabIdsOf(tabReducer(state, tabActions.moveTab(a!.id, 99)))).toEqual([
      b!.id,
      c!.id,
      a!.id,
    ]);
    expect(tabIdsOf(tabReducer(state, tabActions.moveTab(c!.id, -5)))).toEqual([
      c!.id,
      a!.id,
      b!.id,
    ]);
  });

  it("同じ位置へ移動する場合や、存在しないタブを移動する場合は、状態を変えない", () => {
    const [a, b] = [1, 2].map((n) => createTabWithHistory([thread(n)]));
    const state = createState([a!, b!]);

    expect(tabReducer(state, tabActions.moveTab(b!.id, 1))).toBe(state);
    expect(tabReducer(state, tabActions.moveTab("missing-tab", 0))).toBe(state);
  });

  it("ピン留めタブを移動しても、通常のタブの前には入らない", () => {
    const pinnedA = { ...createTabWithHistory([thread(1)]), pinned: true };
    const pinnedB = { ...createTabWithHistory([thread(2)]), pinned: true };
    const plain = createTabWithHistory([thread(3)]);
    const state = createState([pinnedA, pinnedB, plain]);

    const next = tabReducer(state, tabActions.moveTab(pinnedA.id, 5));

    expect(tabIdsOf(next)).toEqual([pinnedB.id, pinnedA.id, plain.id]);
  });

  it("通常のタブを移動しても、ピン留めタブより前には入らない", () => {
    const pinned = { ...createTabWithHistory([thread(1)]), pinned: true };
    const a = createTabWithHistory([thread(2)]);
    const b = createTabWithHistory([thread(3)]);
    const state = createState([pinned, a, b]);

    const next = tabReducer(state, tabActions.moveTab(b.id, 0));

    expect(tabIdsOf(next)).toEqual([pinned.id, b.id, a.id]);
  });
});

describe("タブ内の履歴の移動", () => {
  const pages = [thread(1), thread(2), thread(3)];

  it("戻るは、タブ内の履歴を一つ前へ戻す", () => {
    const state = createState([createTabWithHistory(pages, 2)]);

    const next = tabReducer(state, tabActions.goBack());

    expect(activeTabOf(next).currentIndex).toBe(1);
  });

  it("先頭の履歴からは戻れず、状態を変えない", () => {
    const state = createState([createTabWithHistory(pages, 0)]);

    expect(tabReducer(state, tabActions.goBack())).toBe(state);
  });

  it("進むは、タブ内の履歴を一つ先へ進める", () => {
    const state = createState([createTabWithHistory(pages, 0)]);

    const next = tabReducer(state, tabActions.goForward());

    expect(activeTabOf(next).currentIndex).toBe(1);
  });

  it("最後の履歴からは進めず、状態を変えない", () => {
    const state = createState([createTabWithHistory(pages, 2)]);

    expect(tabReducer(state, tabActions.goForward())).toBe(state);
  });

  it("履歴の指定した位置へ移動する", () => {
    const state = createState([createTabWithHistory(pages, 2)]);

    const next = tabReducer(state, tabActions.goToHistoryIndex(0));

    expect(activeTabOf(next).currentIndex).toBe(0);
    expect(activeTabOf(next).history).toEqual(pages);
  });

  it("履歴の範囲外や現在の位置への移動は、状態を変えない", () => {
    const state = createState([createTabWithHistory(pages, 1)]);

    expect(tabReducer(state, tabActions.goToHistoryIndex(5))).toBe(state);
    expect(tabReducer(state, tabActions.goToHistoryIndex(-1))).toBe(state);
    expect(tabReducer(state, tabActions.goToHistoryIndex(1))).toBe(state);
  });

  it("戻ったあとに新しいページへ移ると、進む先の履歴は捨てる", () => {
    const state = createState([createTabWithHistory(pages, 2)]);
    const back = tabReducer(state, tabActions.goBack());

    const next = tabReducer(back, tabActions.navigate(thread(9)));

    expect(activeTabOf(next).history.map((page) => page.title)).toEqual([
      "スレ1",
      "スレ2",
      "スレ9",
    ]);
    expect(activeTabOf(next).currentIndex).toBe(2);
  });

  it("現在と同じページへの遷移は、履歴を積まず状態を変えない", () => {
    const state = createState([createTabWithHistory(pages, 2)]);

    expect(tabReducer(state, tabActions.navigate(thread(3)))).toBe(state);
  });

  it("タブ指定の遷移で現在と同じページなら、そのタブを選ぶだけで履歴は積まない", () => {
    const first = createTabWithHistory([thread(1)]);
    const second = createTabWithHistory(pages, 2);
    const state = createState([first, second]);

    const next = tabReducer(state, tabActions.navigateTab(second.id, thread(3)));

    expect(next.panes[0]!.activeTabId).toBe(second.id);
    expect(activeTabOf(next).history).toEqual(pages);
  });
});

describe("タイトルの更新", () => {
  it("タイトルの更新は、現在表示しているページの題名だけを変える", () => {
    const pages = [thread(1), thread(2)];
    const state = createState([createTabWithHistory(pages, 1)]);

    const next = tabReducer(state, tabActions.updateTitle("新しい題名"));

    expect(activeTabOf(next).history.map((page) => page.title)).toEqual(["スレ1", "新しい題名"]);
  });

  it("板を指定したタイトルの更新は、履歴の中の同じ板の一覧だけを変え、板名も揃える", () => {
    const board = createBoardPage(BOARD_URL, "旧板名");
    const tab = createTabWithHistory([board, thread(1)], 1);
    const state = createState([tab]);

    const next = tabReducer(state, tabActions.updateTitleForTab(tab.id, "新板名", BOARD_URL));

    const [updatedBoard, untouched] = activeTabOf(next).history;
    expect(updatedBoard).toMatchObject({ title: "新板名", boardTitle: "新板名" });
    expect(untouched).toEqual(thread(1));
  });

  it("板を指定しない更新は、現在のページだけを対象にする", () => {
    const pages = [thread(1), thread(2)];
    const tab = createTabWithHistory(pages, 0);
    const state = createState([tab]);

    const next = tabReducer(state, tabActions.updateTitleForTab(tab.id, "変更後"));

    expect(activeTabOf(next).history.map((page) => page.title)).toEqual(["変更後", "スレ2"]);
  });

  // 変更理由: 内容が変わらない場合はタブのオブジェクトを作り直さず、再描画の対象を増やさない。
  it("すでに同じタイトルなら、タブの内容もオブジェクトも変えない", () => {
    const tab = createTabWithHistory([thread(1)]);
    const state = createState([tab]);

    const next = tabReducer(state, tabActions.updateTitleForTab(tab.id, "スレ1"));

    expect(activeTabOf(next)).toBe(tab);
  });

  it("存在しないタブのタイトルは、どのペインのタブも変えない", () => {
    const tab = createTabWithHistory([thread(1)]);
    const state = createState([tab]);

    const next = tabReducer(state, tabActions.updateTitleForTab("missing-tab", "何か"));

    expect(next.panes[0]!.tabs).toEqual([tab]);
    expect(activeTabOf(next)).toBe(tab);
  });
});

describe("ペインの分割・統合・入れ替え", () => {
  // 分割先のページは新規タブの設定（new_tab_page_mode）に従う。既定の設定では、現在のスレッドを引き継がずホームを開く。
  it("分割すると、操作元の右隣に新規タブの既定のページを持つペインを作り、そこへフォーカスする", () => {
    const tab = createTabWithHistory([thread(1)]);
    const state = createState([tab]);

    const next = tabReducer(state, tabActions.splitPane());

    expect(next.panes).toHaveLength(2);
    expect(next.activePaneId).toBe(next.panes[1]!.id);
    expect(next.panes[0]!.tabs).toEqual([tab]);
    expect(getCurrentPageOf(next.panes[1]!)).toEqual({ type: "home", title: "ホーム" });
  });

  it("ペインの数が上限に達していれば、分割せず状態を変えない", () => {
    const state = createState([createTabWithHistory([thread(1)])]);
    const split = tabReducer(state, tabActions.splitPane());

    expect(tabReducer(split, tabActions.splitPane())).toBe(split);
  });

  it("統合すると、左のペインに両方のタブを左から順に並べ、左へフォーカスする", () => {
    const left = createTabWithHistory([thread(1)]);
    const right = createTabWithHistory([thread(2)]);
    const state = createState([left]);
    const split = tabReducer(state, tabActions.splitPane());
    const withRight = {
      ...split,
      panes: [split.panes[0]!, { ...split.panes[1]!, tabs: [right], activeTabId: right.id }],
    };

    const next = tabReducer(withRight, tabActions.closePane());

    expect(next.panes).toHaveLength(1);
    expect(next.panes[0]!.tabs.map((tab) => tab.id)).toEqual([left.id, right.id]);
    expect(next.activePaneId).toBe(split.panes[0]!.id);
  });

  it("ペインが1つだけなら、統合せず状態を変えない", () => {
    const state = createState([createTabWithHistory([thread(1)])]);

    expect(tabReducer(state, tabActions.closePane())).toBe(state);
  });

  it("2つのペインの表示内容を入れ替え、フォーカスしているペインは変えない", () => {
    const left = createTabWithHistory([thread(1)]);
    const right = createTabWithHistory([thread(2)]);
    const state = createState([left]);
    const split = tabReducer(state, tabActions.splitPane());
    const withRight = {
      ...split,
      panes: [split.panes[0]!, { ...split.panes[1]!, tabs: [right], activeTabId: right.id }],
      activePaneId: split.panes[0]!.id,
    };

    const next = tabReducer(withRight, tabActions.swapPaneTabs());

    expect(getCurrentPageOf(next.panes[0]!)).toEqual(thread(2));
    expect(getCurrentPageOf(next.panes[1]!)).toEqual(thread(1));
    expect(next.activePaneId).toBe(split.panes[0]!.id);
  });

  it("フォーカスするペインを指定すると、そのペインに切り替え、同じなら状態を変えない", () => {
    const state = createState([createTabWithHistory([thread(1)])]);
    const split = tabReducer(state, tabActions.splitPane());
    const leftId = split.panes[0]!.id;

    const next = tabReducer(split, { ...tabActions.setActivePane(), paneId: leftId });

    expect(next.activePaneId).toBe(leftId);
    expect(tabReducer(next, { ...tabActions.setActivePane(), paneId: leftId })).toBe(next);
  });
});

describe("タブのペイン間移動", () => {
  it("右隣のペインがあれば、タブをその末尾へ移し、移したペインへフォーカスする", () => {
    const moving = createTabWithHistory([thread(1)]);
    const stay = createTabWithHistory([thread(2)]);
    const right = createTabWithHistory([thread(3)]);
    const state = createState([moving, stay]);
    const split = tabReducer(state, tabActions.splitPane());
    // 分割直後は新しいペインがフォーカスされるため、操作元の左ペインへ戻してから移動する。
    const withRight = {
      ...split,
      panes: [
        { ...split.panes[0]!, tabs: [moving, stay], activeTabId: moving.id },
        { ...split.panes[1]!, tabs: [right], activeTabId: right.id },
      ],
      activePaneId: split.panes[0]!.id,
    };

    const next = tabReducer(withRight, tabActions.openInRightPane(moving.id));

    expect(next.panes[0]!.tabs.map((tab) => tab.id)).toEqual([stay.id]);
    expect(next.panes[1]!.tabs.map((tab) => tab.id)).toEqual([right.id, moving.id]);
    expect(next.panes[1]!.activeTabId).toBe(moving.id);
    expect(next.activePaneId).toBe(split.panes[1]!.id);
  });

  it("右隣のペインがなければ新しく作り、元のペインに残ったタブを選び直す", () => {
    const moving = createTabWithHistory([thread(1)]);
    const stay = createTabWithHistory([thread(2)]);
    const state = createState([moving, stay]);

    const next = tabReducer(state, tabActions.openInRightPane(moving.id));

    expect(next.panes).toHaveLength(2);
    expect(next.panes[0]!.tabs.map((tab) => tab.id)).toEqual([stay.id]);
    expect(next.panes[0]!.activeTabId).toBe(stay.id);
    expect(next.panes[1]!.tabs.map((tab) => tab.id)).toEqual([moving.id]);
  });

  it("元のペインの最後のタブを移すと、空にせず既定のタブを補う", () => {
    const only = createTabWithHistory([thread(1)]);
    const state = createState([only]);

    const next = tabReducer(state, tabActions.openInRightPane(only.id));

    expect(next.panes[0]!.tabs).toHaveLength(1);
    expect(next.panes[0]!.tabs[0]!.id).not.toBe(only.id);
    expect(next.panes[0]!.activeTabId).toBe(next.panes[0]!.tabs[0]!.id);
    expect(next.panes[1]!.tabs.map((tab) => tab.id)).toEqual([only.id]);
  });

  it("タブをペインの指定した位置へ移し、移し先のペインへフォーカスする", () => {
    const moving = createTabWithHistory([thread(1)]);
    const stay = createTabWithHistory([thread(2)]);
    const target = createTabWithHistory([thread(3)]);
    const state = createState([moving, stay]);
    const split = tabReducer(state, tabActions.splitPane());
    const withTarget = {
      ...split,
      panes: [
        { ...split.panes[0]!, tabs: [moving, stay], activeTabId: moving.id },
        { ...split.panes[1]!, tabs: [target], activeTabId: target.id },
      ],
    };

    const next = tabReducer(
      withTarget,
      tabActions.moveTabToPane(moving.id, split.panes[0]!.id, split.panes[1]!.id, 0),
    );

    expect(next.panes[1]!.tabs.map((tab) => tab.id)).toEqual([moving.id, target.id]);
    expect(next.panes[0]!.tabs.map((tab) => tab.id)).toEqual([stay.id]);
    expect(next.activePaneId).toBe(split.panes[1]!.id);
  });
});

describe("次スレ待機の状態", () => {
  let firstPageKey: string;
  let secondPageKey: string;

  beforeEach(() => {
    // ページ種別はテストごとに登録されるため、自動更新のページキーは各テストの前に求める。
    firstPageKey = getAutoRefreshPageKey(thread(1))!;
    secondPageKey = getAutoRefreshPageKey(thread(2))!;
    // キーが取れないと null同士の比較で誤って通るため、先に確かめる。
    expect(firstPageKey).toEqual(expect.any(String));
    expect(secondPageKey).toEqual(expect.any(String));
  });

  /** 自動更新がONのスレ1のタブを作る。 */
  function createAutoRefreshingState(): TabStoreState {
    const tab = createTabWithHistory([thread(1)]);
    return createState([{ ...tab, autoRefreshEnabled: true, autoRefreshPageKey: firstPageKey }]);
  }

  /** 自動更新中のスレ1を、次スレ待機へ移した状態を作る。 */
  function createWaitingState(): TabStoreState {
    return tabReducer(createAutoRefreshingState(), tabActions.startNextThreadWait(firstPageKey));
  }

  it("自動更新中に待機を始めると、自動更新のONを外して待機として記録する", () => {
    const next = tabReducer(
      createAutoRefreshingState(),
      tabActions.startNextThreadWait(firstPageKey),
    );

    expect(activeTabOf(next).autoRefreshEnabled).toBe(false);
    expect(activeTabOf(next).autoRefreshPageKey).toBeNull();
    expect(activeTabOf(next).nextThreadWaitPageKey).toBe(firstPageKey);
  });

  it("自動更新がOFFのタブでは、待機を始めない", () => {
    const state = createState([createTabWithHistory([thread(1)])]);

    const next = tabReducer(state, tabActions.startNextThreadWait(firstPageKey));

    expect(activeTabOf(next).nextThreadWaitPageKey).toBeNull();
  });

  it("自動更新が別のページに結び付いているときは、待機を始めない", () => {
    const next = tabReducer(
      createAutoRefreshingState(),
      tabActions.startNextThreadWait(secondPageKey),
    );

    expect(activeTabOf(next).autoRefreshEnabled).toBe(true);
    expect(activeTabOf(next).nextThreadWaitPageKey).toBeNull();
  });

  it("待機中のONは無視し、待機の状態を保つ", () => {
    const next = tabReducer(
      createWaitingState(),
      tabActions.setAutoRefreshEnabled(true, firstPageKey),
    );

    expect(activeTabOf(next).autoRefreshEnabled).toBe(false);
    expect(activeTabOf(next).nextThreadWaitPageKey).toBe(firstPageKey);
  });

  it("待機中のOFFは待機を取り消し、同じスレでは自動更新を再開できない停止記録を付ける", () => {
    const cancelled = tabReducer(
      createWaitingState(),
      tabActions.setAutoRefreshEnabled(false, firstPageKey),
    );
    const reopened = tabReducer(cancelled, tabActions.setAutoRefreshEnabled(true, firstPageKey));

    expect(activeTabOf(cancelled).nextThreadWaitPageKey).toBeNull();
    expect(activeTabOf(cancelled).autoRefreshStoppedPageKey).toBe(firstPageKey);
    expect(activeTabOf(reopened).autoRefreshEnabled).toBe(false);
  });

  it("停止記録を付けると、待機も終わる", () => {
    const next = tabReducer(
      createWaitingState(),
      tabActions.setAutoRefreshStoppedPageKey(firstPageKey),
    );

    expect(activeTabOf(next).nextThreadWaitPageKey).toBeNull();
    expect(activeTabOf(next).autoRefreshStoppedPageKey).toBe(firstPageKey);
  });

  it("次スレへ移動すると待機を終え、自動更新を引き継いで次のスレを追う", () => {
    const next = tabReducer(
      createWaitingState(),
      tabActions.followNextThread(thread(2), { keepAutoRefresh: true }),
    );

    expect(activeTabOf(next).nextThreadWaitPageKey).toBeNull();
    expect(activeTabOf(next).autoRefreshEnabled).toBe(true);
    expect(activeTabOf(next).autoRefreshPageKey).toBe(secondPageKey);
  });

  it("待機中に別のページへ移動すると、待機を持ち越さない", () => {
    const next = tabReducer(createWaitingState(), tabActions.navigate(thread(2)));

    expect(activeTabOf(next).nextThreadWaitPageKey).toBeNull();
    expect(activeTabOf(next).autoRefreshEnabled).toBe(false);
  });
});

/** ペインの選択中タブが表示しているページ。 */
function getCurrentPageOf(pane: Pane): Page {
  const tab = pane.tabs.find((candidate) => candidate.id === pane.activeTabId)!;
  return tab.history[tab.currentIndex]!;
}
