import {
  isPopupDescendantOf as isPopupDescendantOfInPopups,
  removePopupBranches,
} from "src/view/browser/hooks/popup-manager/popup-graph";
import type { PopupItem } from "src/view/browser/hooks/popup-manager/types";
import { POPUP_BASE_Z } from "src/view/browser/utils/constants";
import type { StateCreator } from "zustand";
import { create } from "zustand";

export interface PopupScopeState {
  popups: PopupItem[];
  refCount: number;
  nextId: number;
  nextZ: number;
}

interface PopupScopeSlice {
  scopes: Record<string, PopupScopeState>;
  mountScope: (scopeId: string) => void;
  unmountScope: (scopeId: string) => void;
}

interface PopupCollectionSlice {
  addPopupToScope: (scopeId: string, popup: Omit<PopupItem, "id" | "z">) => string;
  closePopupByIdInScope: (scopeId: string, id: string) => void;
  closeAllPopupsInScope: (scopeId: string) => void;
  closePopupsByPredicateInScope: (scopeId: string, predicate: (item: PopupItem) => boolean) => void;
  toggleTreePopupPinnedInScope: (scopeId: string, popupId: string) => void;
  toggleIdPopupPinnedInScope: (scopeId: string, popupId: string) => void;
}

interface PopupGraphSlice {
  closeNonContextPopupsInScope: (scopeId: string) => void;
  closePopupChildrenInScope: (scopeId: string, popupId: string) => void;
  isPopupDescendantOfInScope: (scopeId: string, popupId: string, ancestorId: string) => boolean;
}

export type PopupStoreState = PopupScopeSlice & PopupCollectionSlice & PopupGraphSlice;

function createPopupScope(): PopupScopeState {
  return {
    popups: [],
    refCount: 0,
    nextId: 0,
    nextZ: POPUP_BASE_Z,
  };
}

function getOrCreatePopupScope(
  scopes: Record<string, PopupScopeState>,
  scopeId: string,
): PopupScopeState {
  return scopes[scopeId] ?? createPopupScope();
}

const createPopupScopeSlice: StateCreator<PopupStoreState, [], [], PopupScopeSlice> = (set) => ({
  scopes: {},
  mountScope: (scopeId) => {
    set((state) => {
      const currentScope = getOrCreatePopupScope(state.scopes, scopeId);
      return {
        scopes: {
          ...state.scopes,
          [scopeId]: {
            ...currentScope,
            refCount: currentScope.refCount + 1,
          },
        },
      };
    });
  },
  unmountScope: (scopeId) => {
    set((state) => {
      const currentScope = state.scopes[scopeId];
      if (!currentScope) {
        return state;
      }
      const nextRefCount = currentScope.refCount - 1;
      if (nextRefCount > 0) {
        return {
          scopes: {
            ...state.scopes,
            [scopeId]: {
              ...currentScope,
              refCount: nextRefCount,
            },
          },
        };
      }

      const { [scopeId]: _removedScope, ...remainingScopes } = state.scopes;
      return { scopes: remainingScopes };
    });
  },
});

const createPopupCollectionSlice: StateCreator<PopupStoreState, [], [], PopupCollectionSlice> = (
  set,
  get,
) => ({
  addPopupToScope: (scopeId, popup) => {
    const currentScope = getOrCreatePopupScope(get().scopes, scopeId);
    const id = `${popup.type}-${currentScope.nextId + 1}`;

    set((state) => {
      const nextScope = getOrCreatePopupScope(state.scopes, scopeId);
      const z = nextScope.nextZ + 1;
      const nextPopup = { ...popup, id, z } as PopupItem;
      return {
        scopes: {
          ...state.scopes,
          [scopeId]: {
            ...nextScope,
            nextId: nextScope.nextId + 1,
            nextZ: z,
            popups: [...nextScope.popups, nextPopup],
          },
        },
      };
    });

    return id;
  },
  closePopupByIdInScope: (scopeId, id) => {
    get().closePopupsByPredicateInScope(scopeId, (item) => item.id === id);
  },
  closeAllPopupsInScope: (scopeId) => {
    set((state) => {
      const currentScope = state.scopes[scopeId];
      if (!currentScope) {
        return state;
      }
      return {
        scopes: {
          ...state.scopes,
          [scopeId]: {
            ...currentScope,
            popups: [],
          },
        },
      };
    });
  },
  closePopupsByPredicateInScope: (scopeId, predicate) => {
    set((state) => {
      const currentScope = state.scopes[scopeId];
      if (!currentScope) {
        return state;
      }

      // popupのparentId cascadeは純粋関数へ委譲し、ここでは結果だけを反映する。
      return {
        scopes: {
          ...state.scopes,
          [scopeId]: {
            ...currentScope,
            popups: removePopupBranches(currentScope.popups, predicate),
          },
        },
      };
    });
  },
  toggleTreePopupPinnedInScope: (scopeId, popupId) => {
    set((state) => {
      const currentScope = state.scopes[scopeId];
      if (!currentScope) return state;

      return {
        scopes: {
          ...state.scopes,
          [scopeId]: {
            ...currentScope,
            popups: currentScope.popups.map((item) => {
              if (item.id !== popupId || item.type !== "tree") return item;
              const pinned = !item.payload.pinned;
              return {
                ...item,
                // 親popupが閉じても固定したツリーを巻き込まないよう、固定時はrootへ昇格する。
                parentId: pinned ? undefined : item.parentId,
                payload: { ...item.payload, pinned },
              };
            }),
          },
        },
      };
    });
  },
  toggleIdPopupPinnedInScope: (scopeId, popupId) => {
    set((state) => {
      const currentScope = state.scopes[scopeId];
      if (!currentScope) return state;

      return {
        scopes: {
          ...state.scopes,
          [scopeId]: {
            ...currentScope,
            popups: currentScope.popups.map((item) => {
              if (item.id !== popupId || item.type !== "id") return item;
              const pinned = !item.payload.pinned;
              return {
                ...item,
                // 親popupが閉じても固定したIDポップアップを巻き込まないよう、固定時はrootへ昇格する。
                parentId: pinned ? undefined : item.parentId,
                payload: { ...item.payload, pinned },
              };
            }),
          },
        },
      };
    });
  },
});

const createPopupGraphSlice: StateCreator<PopupStoreState, [], [], PopupGraphSlice> = (
  _set,
  get,
) => ({
  closeNonContextPopupsInScope: (scopeId) => {
    // 固定した返信ツリーとIDポップアップは本文操作後も残し、それ以外のpopup本体だけを閉じる。
    get().closePopupsByPredicateInScope(
      scopeId,
      (item) =>
        item.type !== "contextMenu" &&
        !((item.type === "tree" || item.type === "id") && item.payload.pinned),
    );
  },
  closePopupChildrenInScope: (scopeId, popupId) => {
    // root を残したまま branch をリセットしたいので、popup 自身ではなく direct child を起点に閉じる。
    get().closePopupsByPredicateInScope(scopeId, (item) => item.parentId === popupId);
  },
  isPopupDescendantOfInScope: (scopeId, popupId, ancestorId) => {
    const currentScope = get().scopes[scopeId];
    if (!currentScope) {
      return false;
    }

    return isPopupDescendantOfInPopups(currentScope.popups, popupId, ancestorId);
  },
});

export function createPopupStore() {
  return create<PopupStoreState>()((...args) => ({
    ...createPopupScopeSlice(...args),
    ...createPopupCollectionSlice(...args),
    ...createPopupGraphSlice(...args),
  }));
}

// React hook側は同じstoreを共有し、単体テストや将来のadapterではcreatePopupStoreで独立storeを作れるようにする。
export const usePopupStore = createPopupStore();
