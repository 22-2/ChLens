import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { create } from "zustand";
import type { StateCreator } from "zustand";
import { POPUP_BASE_Z } from "src/view/browser/utils/constants";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
} from "src/view/browser/utils/constants";
import type { IRes } from "src/service-container/interfaces";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  ContextMenuPopupPayload,
  IdPopupItem,
  PopupItem,
  TreePopupItem,
} from "src/view/browser/utils/types";
import { getPopupViewportBounds } from "src/view/browser/utils/use-adjust-overflow";

const DEFAULT_POPUP_SCOPE_ID = "default";
const EMPTY_POPUPS: PopupItem[] = [];

interface PopupScopeState {
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
  closePopupsByPredicateInScope: (
    scopeId: string,
    predicate: (item: PopupItem) => boolean,
  ) => void;
}

type PopupStoreState = PopupScopeSlice & PopupCollectionSlice;

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

const createPopupScopeSlice: StateCreator<PopupStoreState, [], [], PopupScopeSlice> =
  (set) => ({
    scopes: {},
    mountScope: (scopeId) => {
      set((state) => {
        const currentScope = getOrCreatePopupScope(state.scopes, scopeId);
        return {
          scopes: {
            ...state.scopes,
            [scopeId]: {
              ...currentScope,
              // display:none でタブを保持する構成では popup state を tab 単位で分離しないと、
              // hidden page の popup が active page に混ざるので scope を参照カウントで生存管理する。
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

const createPopupCollectionSlice: StateCreator<
  PopupStoreState,
  [],
  [],
  PopupCollectionSlice
> = (set, get) => ({
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

      const removedIds = new Set<string>();
      for (const item of currentScope.popups) {
        if (predicate(item)) {
          removedIds.add(item.id);
        }
      }

      // parentId ツリーをたどって閉じることで、今後スタックの並びが変わっても
      // 親を閉じた時に子メニュー/子ポップアップが取り残されないようにする。
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of currentScope.popups) {
          if (!item.parentId || removedIds.has(item.id)) {
            continue;
          }
          if (removedIds.has(item.parentId)) {
            removedIds.add(item.id);
            changed = true;
          }
        }
      }

      return {
        scopes: {
          ...state.scopes,
          [scopeId]: {
            ...currentScope,
            popups: currentScope.popups.filter((item) => !removedIds.has(item.id)),
          },
        },
      };
    });
  },
});

const usePopupStore = create<PopupStoreState>()((...args) => ({
  ...createPopupScopeSlice(...args),
  ...createPopupCollectionSlice(...args),
}));

export interface PopupManagerResult {
  popups: PopupItem[];
  addPopup: (popup: Omit<PopupItem, "id" | "z">) => string;
  closePopupById: (id: string) => void;
  closeAllPopups: () => void;
  closePopupsByPredicate: (predicate: (item: PopupItem) => boolean) => void;
}

export interface ThreadPopupLifecycleParams {
  scopeId?: string;
  rootRef: RefObject<HTMLDivElement | null>;
  resMap: Map<number, IRes>;
}

export interface ThreadPopupLifecycleResult {
  popups: PopupItem[];
  anchorPreviews: AnchorPopupItem[];
  treePopupItems: TreePopupItem[];
  idPopup?: IdPopupItem;
  contextMenuItems: ContextMenuPopupItem[];
  hasAnchorPreviews: boolean;
  addPopup: (popup: Omit<PopupItem, "id" | "z">) => string;
  addTreePopup: (
    resNum: number,
    clientX: number,
    clientY: number,
    parentId?: string,
    anchorPreviewDepth?: number,
  ) => string;
  addPopupContextMenu: (
    clientX: number,
    clientY: number,
    items: ContextMenuPopupPayload["items"],
    parentId?: string,
  ) => string;
  addIdPopup: (
    clientX: number,
    clientY: number,
    items: IRes[],
    title: string,
    parentId?: string,
  ) => string;
  clearAnchorPreviewHideTimer: () => void;
  closeNonContextPopups: () => void;
  closePopupById: (id: string) => void;
  closePopupChildren: (popupId: string) => void;
  hasPopupChild: (popupId: string) => boolean;
  hideAnchorPreview: (fromDepth?: number) => void;
  hideAnchorPreviewImmediately: (fromDepth?: number) => void;
  showAnchorPreview: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
    sourcePopupId?: string,
  ) => void;
}

export function usePopupManager(
  scopeId = DEFAULT_POPUP_SCOPE_ID,
): PopupManagerResult {
  const popups = usePopupStore(
    useCallback(
      (state) => state.scopes[scopeId]?.popups ?? EMPTY_POPUPS,
      [scopeId],
    ),
  );
  const mountScope = usePopupStore((state) => state.mountScope);
  const unmountScope = usePopupStore((state) => state.unmountScope);
  const addPopupToScope = usePopupStore((state) => state.addPopupToScope);
  const closePopupByIdInScope = usePopupStore((state) => state.closePopupByIdInScope);
  const closeAllPopupsInScope = usePopupStore((state) => state.closeAllPopupsInScope);
  const closePopupsByPredicateInScope = usePopupStore(
    (state) => state.closePopupsByPredicateInScope,
  );

  useEffect(() => {
    mountScope(scopeId);
    return () => unmountScope(scopeId);
  }, [mountScope, scopeId, unmountScope]);

  const addPopup = useCallback(
    (popup: Omit<PopupItem, "id" | "z">) => addPopupToScope(scopeId, popup),
    [addPopupToScope, scopeId],
  );
  const closePopupById = useCallback(
    (id: string) => closePopupByIdInScope(scopeId, id),
    [closePopupByIdInScope, scopeId],
  );
  const closeAllPopups = useCallback(
    () => closeAllPopupsInScope(scopeId),
    [closeAllPopupsInScope, scopeId],
  );
  const closePopupsByPredicate = useCallback(
    (predicate: (item: PopupItem) => boolean) =>
      closePopupsByPredicateInScope(scopeId, predicate),
    [closePopupsByPredicateInScope, scopeId],
  );

  return {
    popups,
    addPopup,
    closePopupById,
    closeAllPopups,
    closePopupsByPredicate,
  };
}

export function useThreadPopupLifecycle({
  scopeId = DEFAULT_POPUP_SCOPE_ID,
  rootRef,
  resMap,
}: ThreadPopupLifecycleParams): ThreadPopupLifecycleResult {
  const { popups, addPopup, closePopupById, closePopupsByPredicate } =
    usePopupManager(scopeId);
  const anchorPreviewHideTimerRef = useRef<number | null>(null);

  const anchorPreviews = useMemo(
    () =>
      popups
        .filter((item): item is AnchorPopupItem => item.type === "anchor")
        .sort((left, right) => left.payload.depth - right.payload.depth),
    [popups],
  );
  const anchorPreviewsRef = useRef<AnchorPopupItem[]>(anchorPreviews);
  anchorPreviewsRef.current = anchorPreviews;

  const treePopupItems = useMemo(
    () => popups.filter((item): item is TreePopupItem => item.type === "tree"),
    [popups],
  );
  const idPopup = useMemo(
    () => popups.find((item): item is IdPopupItem => item.type === "id"),
    [popups],
  );
  const contextMenuItems = useMemo(
    () =>
      popups.filter(
        (item): item is ContextMenuPopupItem => item.type === "contextMenu",
      ),
    [popups],
  );

  const toPageCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!rootRef.current) {
        return { x: clientX, y: clientY };
      }
      const rect = rootRef.current.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    [rootRef],
  );

  const clearAnchorPreviewHideTimer = useCallback(() => {
    if (anchorPreviewHideTimerRef.current != null) {
      window.clearTimeout(anchorPreviewHideTimerRef.current);
      anchorPreviewHideTimerRef.current = null;
    }
  }, []);

  const hideAnchorPreviewsFromDepth = useCallback(
    (depth: number) => {
      closePopupsByPredicate(
        (item) => item.type === "anchor" && item.payload.depth >= depth,
      );
    },
    [closePopupsByPredicate],
  );

  const hideAnchorPreviewImmediately = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      hideAnchorPreviewsFromDepth(fromDepth);
    },
    [clearAnchorPreviewHideTimer, hideAnchorPreviewsFromDepth],
  );

  const hideAnchorPreview = useCallback(
    (fromDepth = 0) => {
      clearAnchorPreviewHideTimer();
      anchorPreviewHideTimerRef.current = window.setTimeout(() => {
        anchorPreviewHideTimerRef.current = null;
        hideAnchorPreviewsFromDepth(fromDepth);
      }, ANCHOR_PREVIEW_HIDE_DELAY_MS);
    },
    [clearAnchorPreviewHideTimer, hideAnchorPreviewsFromDepth],
  );

  const showAnchorPreview = useCallback(
    (
      targets: number[],
      anchorRect: DOMRect,
      label: string,
      depth: number,
      sourcePopupId?: string,
    ) => {
      clearAnchorPreviewHideTimer();
      const items = targets
        .map((num) => resMap.get(num))
        .filter((res): res is IRes => !!res);
      if (items.length === 0) {
        hideAnchorPreviewsFromDepth(depth);
        return;
      }

      const maxWidth = Math.min(
        ANCHOR_PREVIEW_MAX_WIDTH,
        window.innerWidth - ANCHOR_PREVIEW_GUTTER * 2,
      );
      const viewport = getPopupViewportBounds();
      const vx = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.left,
          window.innerWidth - maxWidth - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const vy = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.bottom + ANCHOR_PREVIEW_OFFSET,
          viewport.bottom - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const { x, y } = toPageCoords(vx, vy);
      const currentPreview = anchorPreviewsRef.current.find(
        (item) => item.payload.depth === depth,
      );
      if (
        currentPreview &&
        currentPreview.payload.label === label &&
        currentPreview.x === x &&
        currentPreview.y === y &&
        currentPreview.payload.items.length === items.length &&
        currentPreview.payload.items.every(
          (item, index) => item.num === items[index]?.num,
        )
      ) {
        return;
      }

      const parentId =
        depth > 0 ? anchorPreviewsRef.current[depth - 1]?.id : sourcePopupId;
      hideAnchorPreviewsFromDepth(depth);
      addPopup({
        type: "anchor",
        x,
        y,
        payload: { items, label, depth },
        parentId,
      });
    },
    [
      addPopup,
      clearAnchorPreviewHideTimer,
      hideAnchorPreviewsFromDepth,
      resMap,
      toPageCoords,
    ],
  );

  const addTreePopup = useCallback(
    (
      resNum: number,
      clientX: number,
      clientY: number,
      parentId?: string,
      anchorPreviewDepth = 0,
    ) => {
      const { x, y } = toPageCoords(clientX, clientY);
      return addPopup({
        type: "tree",
        x,
        y,
        payload: { resNum, anchorPreviewDepth },
        parentId,
      });
    },
    [addPopup, toPageCoords],
  );

  const addPopupContextMenu = useCallback(
    (
      clientX: number,
      clientY: number,
      items: ContextMenuPopupPayload["items"],
      parentId?: string,
    ) => {
      closePopupsByPredicate((item) => item.type === "contextMenu");
      const { x, y } = toPageCoords(clientX, clientY);
      return addPopup({
        type: "contextMenu",
        x,
        y,
        payload: { items },
        parentId,
      });
    },
    [addPopup, closePopupsByPredicate, toPageCoords],
  );

  const addIdPopup = useCallback(
    (
      clientX: number,
      clientY: number,
      items: IRes[],
      title: string,
      parentId?: string,
    ) => {
      const { x, y } = toPageCoords(clientX, clientY);
      return addPopup({
        type: "id",
        x,
        y,
        payload: { items, title },
        parentId,
      });
    },
    [addPopup, toPageCoords],
  );

  const closeNonContextPopups = useCallback(() => {
    closePopupsByPredicate((item) => item.type !== "contextMenu");
  }, [closePopupsByPredicate]);

  const hasPopupChild = useCallback(
    (popupId: string) => popups.some((item) => item.parentId === popupId),
    [popups],
  );

  const closePopupChildren = useCallback(
    (popupId: string) => {
      // 親popupを操作した時は、その枝配下の子孫だけを畳んでから次の操作を始める。
      // root を残したまま branch をリセットしたいので、popup 自身ではなく direct child を起点に閉じる。
      closePopupsByPredicate((item) => item.parentId === popupId);
    },
    [closePopupsByPredicate],
  );

  useEffect(() => {
    return () => {
      if (anchorPreviewHideTimerRef.current != null) {
        window.clearTimeout(anchorPreviewHideTimerRef.current);
      }
    };
  }, []);

  return {
    popups,
    anchorPreviews,
    treePopupItems,
    idPopup,
    contextMenuItems,
    hasAnchorPreviews: anchorPreviews.length > 0,
    addPopup,
    addTreePopup,
    addPopupContextMenu,
    addIdPopup,
    clearAnchorPreviewHideTimer,
    closeNonContextPopups,
    closePopupById,
    closePopupChildren,
    hasPopupChild,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    showAnchorPreview,
  };
}
