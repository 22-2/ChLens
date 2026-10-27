import { setupTestPageTypes } from "src/test-support/page-types-test-setup";
import { registerPageTarget } from "src/view/browser/extension/page-actions";
import { createBoundWorkspace } from "src/view/browser/extension/workspace-api";
import { tabReducer } from "src/view/browser/state/tabs/tab-store-reducer";
import type { ScopedTabAction, TabStoreState } from "src/view/browser/state/tabs/tab-store-types";
import { createHomeTab, getCurrentPage } from "src/view/browser/types";
import { describe, expect, it, vi } from "vite-plus/test";

setupTestPageTypes();

describe("実行元に結び付いたワークスペース", () => {
  function setup() {
    const left = createHomeTab("left-tab");
    const right = createHomeTab("right-tab");
    const stateRef: { current: TabStoreState } = {
      current: {
        panes: [
          { id: "left", activeTabId: left.id, tabs: [left] },
          { id: "right", activeTabId: right.id, tabs: [right] },
        ],
        activePaneId: "left",
        closedTabs: [],
      },
    };
    const dispatch = vi.fn((action: ScopedTabAction) => {
      stateRef.current = tabReducer(stateRef.current, action);
    });
    return { stateRef, dispatch };
  }

  it("選択中の別ペインではなく、指定したタブへページを開く", () => {
    const { stateRef, dispatch } = setup();
    const dispose = registerPageTarget(window, "right-tab");
    try {
      const workspace = createBoundWorkspace(window, "right-tab", stateRef, dispatch);
      expect(workspace.openPage({ type: "bookmarkList", title: "ブックマーク" })).toBe("executed");
      expect(getCurrentPage(stateRef.current.panes[1].tabs[0]).type).toBe("bookmarkList");
      expect(getCurrentPage(stateRef.current.panes[0].tabs[0]).type).toBe("home");
      expect(stateRef.current.activePaneId).toBe("right");
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "NAVIGATE", tabId: "right-tab", paneId: "right" }),
      );
    } finally {
      dispose();
    }
  });

  it("新規タブは実行元のペインに追加する", () => {
    const { stateRef, dispatch } = setup();
    const dispose = registerPageTarget(window, "right-tab");
    try {
      const workspace = createBoundWorkspace(window, "right-tab", stateRef, dispatch);
      expect(
        workspace.openPage({ type: "bookmarkList", title: "ブックマーク" }, { newTab: true }),
      ).toBe("executed");
      expect(stateRef.current.panes[0].tabs).toHaveLength(1);
      expect(stateRef.current.panes[1].tabs).toHaveLength(2);
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: "OPEN_IN_NEW_TAB", paneId: "right" }),
      );
    } finally {
      dispose();
    }
  });

  it("タブが閉じた直後は別のタブへ操作を送らない", () => {
    const { stateRef, dispatch } = setup();
    const dispose = registerPageTarget(window, "right-tab");
    try {
      const workspace = createBoundWorkspace(window, "right-tab", stateRef, dispatch);
      stateRef.current = { ...stateRef.current, panes: [stateRef.current.panes[0]] };
      expect(workspace.openPage({ type: "bookmarkList", title: "ブックマーク" })).toBe(
        "target-unavailable",
      );
      expect(
        workspace.openPage({ type: "bookmarkList", title: "ブックマーク" }, { newTab: true }),
      ).toBe("target-unavailable");
      expect(dispatch).not.toHaveBeenCalled();
      expect(getCurrentPage(stateRef.current.panes[0].tabs[0]).type).toBe("home");
    } finally {
      dispose();
    }
  });

  it("別窓への移動後は旧窓から操作せず、移動先から操作する", () => {
    const { stateRef, dispatch } = setup();
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const otherWindow = iframe.contentWindow;
    if (!otherWindow) throw new Error("テスト用の窓を作れませんでした");
    const disposeOld = registerPageTarget(window, "right-tab");
    const oldWorkspace = createBoundWorkspace(window, "right-tab", stateRef, dispatch);
    disposeOld();
    const disposeNew = registerPageTarget(otherWindow, "right-tab");
    try {
      const newWorkspace = createBoundWorkspace(otherWindow, "right-tab", stateRef, dispatch);
      const page = { type: "bookmarkList" as const, title: "ブックマーク" };
      expect(oldWorkspace.openPage(page)).toBe("target-unavailable");
      expect(dispatch).not.toHaveBeenCalled();
      expect(newWorkspace.openPage(page)).toBe("executed");
      expect(getCurrentPage(stateRef.current.panes[1].tabs[0]).type).toBe("bookmarkList");
      expect(stateRef.current.activePaneId).toBe("left");
    } finally {
      disposeNew();
      iframe.remove();
    }
  });
});
