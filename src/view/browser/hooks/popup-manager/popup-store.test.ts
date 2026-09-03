import type { PopupItem } from "src/view/browser/hooks/popup-manager/types";
import { describe, expect, it } from "vite-plus/test";
import { createPopupStore } from "./popup-store";

function addTreePopup(
  store: ReturnType<typeof createPopupStore>,
  scopeId: string,
  resNum = 1,
  parentId?: string,
): string {
  return store.getState().addPopupToScope(scopeId, {
    type: "tree",
    x: 0,
    y: 0,
    payload: { resNum, anchorPreviewDepth: 0 },
    ...(parentId == null ? {} : { parentId }),
  });
}

function addContextMenuPopup(
  store: ReturnType<typeof createPopupStore>,
  scopeId: string,
  parentId?: string,
): string {
  return store.getState().addPopupToScope(scopeId, {
    type: "contextMenu",
    x: 0,
    y: 0,
    payload: { items: [] },
    ...(parentId == null ? {} : { parentId }),
  });
}

function addIdPopup(
  store: ReturnType<typeof createPopupStore>,
  scopeId: string,
  parentId?: string,
): string {
  return store.getState().addPopupToScope(scopeId, {
    type: "id",
    x: 0,
    y: 0,
    payload: { items: [], title: "ID:AAA", pinned: false },
    ...(parentId == null ? {} : { parentId }),
  });
}

function getScopePopups(store: ReturnType<typeof createPopupStore>, scopeId: string): PopupItem[] {
  return store.getState().scopes[scopeId]?.popups ?? [];
}

describe("popup store", () => {
  it("scopeごとにpopup stateを分離し、参照がなくなったscopeを破棄する", () => {
    const store = createPopupStore();
    const state = store.getState();

    state.mountScope("left");
    state.mountScope("left");
    state.mountScope("right");
    const leftPopupId = addTreePopup(store, "left", 1);
    const rightPopupId = addTreePopup(store, "right", 2);

    expect(getScopePopups(store, "left").map((item) => item.id)).toEqual([leftPopupId]);
    expect(getScopePopups(store, "right").map((item) => item.id)).toEqual([rightPopupId]);

    state.unmountScope("left");
    expect(getScopePopups(store, "left")).toHaveLength(1);

    state.unmountScope("left");
    expect(store.getState().scopes.left).toBeUndefined();
    expect(getScopePopups(store, "right")).toHaveLength(1);
  });

  it("親popupを閉じると子孫だけをcascade closeし、別scopeには影響しない", () => {
    const store = createPopupStore();
    const state = store.getState();
    state.mountScope("main");
    state.mountScope("other");

    const rootId = addTreePopup(store, "main");
    const childId = addTreePopup(store, "main", 2, rootId);
    const grandchildId = addContextMenuPopup(store, "main", childId);
    const otherScopeId = addTreePopup(store, "other", 9);

    expect(state.isPopupDescendantOfInScope("main", grandchildId, rootId)).toBe(true);
    state.closePopupByIdInScope("main", rootId);

    expect(getScopePopups(store, "main")).toEqual([]);
    expect(getScopePopups(store, "other").map((item) => item.id)).toEqual([otherScopeId]);
  });

  it("固定treeとcontext menuをcloseNonContextの対象外にする", () => {
    const store = createPopupStore();
    const state = store.getState();
    state.mountScope("pin-contract");

    const normalTreeId = addTreePopup(store, "pin-contract", 1);
    const pinnedTreeId = addTreePopup(store, "pin-contract", 2);
    const contextMenuId = addContextMenuPopup(store, "pin-contract", pinnedTreeId);
    state.toggleTreePopupPinnedInScope("pin-contract", pinnedTreeId);

    state.closeNonContextPopupsInScope("pin-contract");

    expect(getScopePopups(store, "pin-contract").map((item) => item.id)).toEqual([
      pinnedTreeId,
      contextMenuId,
    ]);
    expect(getScopePopups(store, "pin-contract").some((item) => item.id === normalTreeId)).toBe(
      false,
    );
  });

  it("固定IDポップアップを親から切り離し、closeNonContextの対象外にする", () => {
    const store = createPopupStore();
    const state = store.getState();
    state.mountScope("pin-id-contract");

    const parentId = addTreePopup(store, "pin-id-contract", 1);
    const idPopupId = addIdPopup(store, "pin-id-contract", parentId);
    const contextMenuId = addContextMenuPopup(store, "pin-id-contract", idPopupId);

    state.toggleIdPopupPinnedInScope("pin-id-contract", idPopupId);
    const pinnedIdPopup = getScopePopups(store, "pin-id-contract").find(
      (item) => item.id === idPopupId,
    );
    expect(pinnedIdPopup?.type).toBe("id");
    if (pinnedIdPopup?.type !== "id") {
      throw new Error("IDポップアップが見つかりません");
    }
    expect(pinnedIdPopup.payload.pinned).toBe(true);
    expect(pinnedIdPopup.parentId).toBeUndefined();

    state.closeNonContextPopupsInScope("pin-id-contract");

    expect(getScopePopups(store, "pin-id-contract").map((item) => item.id)).toEqual([
      idPopupId,
      contextMenuId,
    ]);
  });
});
