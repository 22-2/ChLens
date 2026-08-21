import type React from "react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IRes } from "src/service-container/interfaces";
import {
  isPopupDescendantOf as isPopupDescendantOfInPopups,
  removePopupBranches,
} from "src/view/browser/hooks/popup-manager/popup-graph";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
  POPUP_BASE_Z,
  POPUP_SURFACE_ID_ATTRIBUTE,
  POPUP_SURFACE_SELECTOR,
} from "src/view/browser/utils/constants";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  ContextMenuPopupPayload,
  IdPopupItem,
  PopupItem,
  TreePopupItem,
} from "src/view/browser/utils/types";
import { getPopupViewportBounds } from "src/view/browser/utils/use-adjust-overflow";
import { getEventTargetElement } from "src/view/browser/utils/utils";
import type { StateCreator } from "zustand";
import { create } from "zustand";

const DEFAULT_POPUP_SCOPE_ID = "default";
const EMPTY_POPUPS: PopupItem[] = [];
// コンテキストメニューの項目操作は親ポップアップの枝を畳む対象外にする。
// mousedown は親surfaceのcaptureにも届くため、除外しないとレスツリー内の
// 子レス用メニューをクリックしただけで親ツリーまで閉じてしまう。
const POPUP_KEEP_OPEN_TARGET_SELECTOR =
  "a, .res__link, .res__thumb, .res__media-embed, .context-menu";
const POPUP_MOUSELEAVE_SUPPRESS_MS = 250;

function isContextMenuPopupId(popupId: string | null): boolean {
  return popupId?.startsWith("contextMenu-") ?? false;
}

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
  closePopupsByPredicateInScope: (scopeId: string, predicate: (item: PopupItem) => boolean) => void;
  toggleTreePopupPinnedInScope: (scopeId: string, popupId: string) => void;
}

interface PopupGraphSlice {
  closeNonContextPopupsInScope: (scopeId: string) => void;
  closePopupChildrenInScope: (scopeId: string, popupId: string) => void;
  isPopupDescendantOfInScope: (scopeId: string, popupId: string, ancestorId: string) => boolean;
}

type PopupStoreState = PopupScopeSlice & PopupCollectionSlice & PopupGraphSlice;

function getPopupSurfaceId(target: EventTarget | null): string | null {
  const targetElement = getEventTargetElement(target);
  const popupSurface = targetElement?.closest(POPUP_SURFACE_SELECTOR);
  return popupSurface?.getAttribute(POPUP_SURFACE_ID_ATTRIBUTE) ?? null;
}

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

      // popupのparentId cascadeは純粋関数へ委譲し、scope state更新は結果の差し替えだけにする。
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
});

const createPopupGraphSlice: StateCreator<PopupStoreState, [], [], PopupGraphSlice> = (
  _set,
  get,
) => ({
  closeNonContextPopupsInScope: (scopeId) => {
    // 固定した返信ツリーは本文操作後も残し、それ以外のpopup本体だけを閉じる。
    get().closePopupsByPredicateInScope(
      scopeId,
      (item) => item.type !== "contextMenu" && !(item.type === "tree" && item.payload.pinned),
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

const usePopupStore = create<PopupStoreState>()((...args) => ({
  ...createPopupScopeSlice(...args),
  ...createPopupCollectionSlice(...args),
  ...createPopupGraphSlice(...args),
}));

export interface PopupManagerResult {
  popups: PopupItem[];
  addPopup: (popup: Omit<PopupItem, "id" | "z">) => string;
  closePopupById: (id: string) => void;
  closeAllPopups: () => void;
  closePopupsByPredicate: (predicate: (item: PopupItem) => boolean) => void;
  closeNonContextPopups: () => void;
  closePopupChildren: (popupId: string) => void;
  isPopupDescendantOf: (popupId: string, ancestorId: string) => boolean;
  toggleTreePopupPinned: (popupId: string) => void;
}

interface PopupSurfaceLifecycleParams {
  surfaceRef?: RefObject<HTMLElement | null>;
  outsideClickIgnoreRefs?: Array<RefObject<HTMLElement | null>>;
  popupId?: string;
  isPopupDescendantOf?: (popupId: string, ancestorId: string) => boolean;
  onEnterFromDescendant?: () => void;
  closeDisabled?: boolean;
  closeOnMouseLeave?: boolean;
  closeOnOutsideClick?: boolean;
  onClose: () => void;
  onSurfaceMouseDown?: () => void;
  onSurfaceMouseEnter?: () => void;
  onSurfaceMouseLeave?: () => void;
}

interface PopupSurfaceLifecycleResult {
  armMouseLeaveCloseSuppression: () => void;
  handleAuxClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseDownCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseLeave: (event: React.MouseEvent<HTMLElement>) => void;
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
  idPopupItems: IdPopupItem[];
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
  isPopupDescendantOf: (popupId: string, ancestorId: string) => boolean;
  toggleTreePopupPinned: (popupId: string) => void;
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

export function usePopupManager(scopeId = DEFAULT_POPUP_SCOPE_ID): PopupManagerResult {
  const popups = usePopupStore(
    useCallback((state) => state.scopes[scopeId]?.popups ?? EMPTY_POPUPS, [scopeId]),
  );
  const mountScope = usePopupStore((state) => state.mountScope);
  const unmountScope = usePopupStore((state) => state.unmountScope);
  const addPopupToScope = usePopupStore((state) => state.addPopupToScope);
  const closePopupByIdInScope = usePopupStore((state) => state.closePopupByIdInScope);
  const closeAllPopupsInScope = usePopupStore((state) => state.closeAllPopupsInScope);
  const closePopupsByPredicateInScope = usePopupStore(
    (state) => state.closePopupsByPredicateInScope,
  );
  const closeNonContextPopupsInScope = usePopupStore((state) => state.closeNonContextPopupsInScope);
  const closePopupChildrenInScope = usePopupStore((state) => state.closePopupChildrenInScope);
  const isPopupDescendantOfInScope = usePopupStore((state) => state.isPopupDescendantOfInScope);
  const toggleTreePopupPinnedInScope = usePopupStore((state) => state.toggleTreePopupPinnedInScope);

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
    (predicate: (item: PopupItem) => boolean) => closePopupsByPredicateInScope(scopeId, predicate),
    [closePopupsByPredicateInScope, scopeId],
  );
  const closeNonContextPopups = useCallback(
    () => closeNonContextPopupsInScope(scopeId),
    [closeNonContextPopupsInScope, scopeId],
  );
  const closePopupChildren = useCallback(
    (popupId: string) => closePopupChildrenInScope(scopeId, popupId),
    [closePopupChildrenInScope, scopeId],
  );
  const isPopupDescendantOf = useCallback(
    (popupId: string, ancestorId: string) =>
      isPopupDescendantOfInScope(scopeId, popupId, ancestorId),
    [isPopupDescendantOfInScope, scopeId],
  );
  const toggleTreePopupPinned = useCallback(
    (popupId: string) => toggleTreePopupPinnedInScope(scopeId, popupId),
    [scopeId, toggleTreePopupPinnedInScope],
  );

  return {
    popups,
    addPopup,
    closePopupById,
    closeAllPopups,
    closePopupsByPredicate,
    closeNonContextPopups,
    closePopupChildren,
    isPopupDescendantOf,
    toggleTreePopupPinned,
  };
}

export function usePopupSurfaceCloseGuard(onSurfaceMouseDown?: () => void) {
  const suppressCloseUntilRef = useRef(0);
  const suppressNextMouseLeaveRef = useRef(false);

  const armMouseLeaveCloseSuppression = useCallback(() => {
    // middle click 後の close はブラウザやデバイス差で発火タイミングが揺れるため、
    // 時間窓だけでなく「次の mouseleave を1回だけ必ず無視」するガードを併用する。
    suppressNextMouseLeaveRef.current = true;
    suppressCloseUntilRef.current = Date.now() + POPUP_MOUSELEAVE_SUPPRESS_MS;
  }, []);

  const handleMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(POPUP_KEEP_OPEN_TARGET_SELECTOR)) {
        // popup本体クリック時は枝を畳みたいが、リンク操作まで同じ扱いにすると
        // 「ポップアップ内のa要素を押した瞬間に子popupが消える」ので先に除外する。
        armMouseLeaveCloseSuppression();
        return;
      }

      // 右クリック（button=2）は contextmenu イベントで処理するため、
      // onSurfaceMouseDown を呼ばない。呼ぶと Zustand 状態更新が
      // contextmenu より先に同期レンダリングされ、テキスト選択が消えてしまう。
      if (event.button === 2) {
        return;
      }

      onSurfaceMouseDown?.();
    },
    [armMouseLeaveCloseSuppression, onSurfaceMouseDown],
  );

  const shouldSuppressMouseLeaveClose = useCallback(() => {
    if (suppressNextMouseLeaveRef.current) {
      suppressNextMouseLeaveRef.current = false;
      return true;
    }
    return suppressCloseUntilRef.current > Date.now();
  }, []);

  const handleAuxClickCapture = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 1) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(POPUP_KEEP_OPEN_TARGET_SELECTOR)) {
        return;
      }

      armMouseLeaveCloseSuppression();
    },
    [armMouseLeaveCloseSuppression],
  );

  return {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    shouldSuppressMouseLeaveClose,
  };
}

export function usePopupSurfaceLifecycle({
  surfaceRef,
  outsideClickIgnoreRefs,
  popupId,
  isPopupDescendantOf,
  onEnterFromDescendant,
  closeDisabled,
  closeOnMouseLeave = true,
  closeOnOutsideClick = true,
  onClose,
  onSurfaceMouseDown,
  onSurfaceMouseEnter,
  onSurfaceMouseLeave,
}: PopupSurfaceLifecycleParams): PopupSurfaceLifecycleResult {
  const [isHovering, setIsHovering] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const suppressNextDisableReleaseCloseRef = useRef(false);

  const {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    shouldSuppressMouseLeaveClose,
  } = usePopupSurfaceCloseGuard(onSurfaceMouseDown);

  const isPopupBranchTarget = useCallback(
    (target: EventTarget | null) => {
      const targetPopupId = getPopupSurfaceId(target);
      if (!popupId || !targetPopupId) {
        return false;
      }

      return targetPopupId === popupId || isPopupDescendantOf?.(targetPopupId, popupId) === true;
    },
    [isPopupDescendantOf, popupId],
  );

  const isWithinIgnoredOutsideTarget = useCallback(
    (target: EventTarget | null) => {
      if (!(target instanceof Node)) {
        return false;
      }

      return (
        outsideClickIgnoreRefs?.some((ignoreRef) => ignoreRef.current?.contains(target)) ?? false
      );
    },
    [outsideClickIgnoreRefs],
  );

  const prevCloseDisabledRef = useRef(!!closeDisabled);
  useEffect(() => {
    const wasDisabled = prevCloseDisabledRef.current;
    prevCloseDisabledRef.current = !!closeDisabled;
    const isActuallyHovering = surfaceRef?.current?.matches(":hover") ?? isHovering;
    if (!closeOnMouseLeave) {
      // コンテキストメニューは outside click でのみ閉じる仕様なので、
      // 子popup終了時の disable 復帰で親まで自動 close しない。
      return;
    }
    if (wasDisabled && !closeDisabled && suppressNextDisableReleaseCloseRef.current) {
      // 子から親へ戻る途中は child branch を先に落とすので、
      // disable 復帰の瞬間だけ親の自動 close を1回抑止して hover 遷移を待つ。
      suppressNextDisableReleaseCloseRef.current = false;
      return;
    }
    // 子popupが閉じた直後に mouseleave を取り逃したケースは、
    // React state だけだと子popup経由の移動で stale になることがあるため、
    // 復帰判定だけは実 DOM の :hover を優先して閉じ忘れを防ぐ。
    if (wasDisabled && !closeDisabled && !isActuallyHovering) {
      onCloseRef.current();
    }
  }, [closeDisabled, closeOnMouseLeave, isHovering, surfaceRef]);

  useEffect(() => {
    const handleOutsideMouseDown = (event: MouseEvent) => {
      const targetPopupId = getPopupSurfaceId(event.target);
      if (
        popupId &&
        targetPopupId &&
        targetPopupId !== popupId &&
        isPopupBranchTarget(event.target)
      ) {
        // 子メニュー内 click で child branch が閉じた直後は、
        // 親 popup まで disable 復帰 auto-close で巻き込まないように1回だけ抑止する。
        suppressNextDisableReleaseCloseRef.current = true;
      }

      // トリガー上の pointer/mouse down では先に close せず、
      // 後段の click トグルに開閉の責務を寄せて「閉じるつもりが再オープン」を防ぐ。
      if (isWithinIgnoredOutsideTarget(event.target)) {
        return;
      }

      if (!closeOnOutsideClick) {
        return;
      }

      if (event.target instanceof Node && surfaceRef?.current?.contains(event.target)) {
        return;
      }

      const target = getEventTargetElement(event.target);
      const popupSurface = target?.closest(POPUP_SURFACE_SELECTOR);
      if (!popupSurface) {
        onCloseRef.current();
        return;
      }

      if (!popupId) {
        return;
      }

      if (isPopupBranchTarget(event.target)) {
        return;
      }

      onCloseRef.current();
    };
    document.addEventListener("mousedown", handleOutsideMouseDown);
    return () => document.removeEventListener("mousedown", handleOutsideMouseDown);
  }, [closeOnOutsideClick, isPopupBranchTarget, isWithinIgnoredOutsideTarget, popupId, surfaceRef]);

  const handleMouseEnter = (event: React.MouseEvent<HTMLElement>) => {
    setIsHovering(true);
    const relatedPopupId = getPopupSurfaceId(event.relatedTarget);
    if (popupId && isPopupDescendantOf?.(relatedPopupId ?? "", popupId)) {
      if (isContextMenuPopupId(relatedPopupId)) {
        // コンテキストメニューは outside click まで維持したいので、
        // 子メニューから親へ戻っても branch を自動で閉じない。
        onSurfaceMouseEnter?.();
        return;
      }
      // 親へ戻った瞬間にその親配下の枝を畳むと、子から親へ戻った後に古い子孫が残らない。
      suppressNextDisableReleaseCloseRef.current = true;
      onEnterFromDescendant?.();
    }
    onSurfaceMouseEnter?.();
  };

  const handleMouseLeave = (event: React.MouseEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    const relatedPopupId = getPopupSurfaceId(event.relatedTarget);
    if (popupId && relatedPopupId) {
      if (isPopupBranchTarget(event.relatedTarget)) {
        // 子孫popupへ移動した時も実際には親surfaceを離れているので hover だけは解除し、
        // 子が閉じた瞬間に「まだ親を指しているか」を closeDisabled の復帰判定で見直せるようにする。
        setIsHovering(false);
        return;
      }
    }
    if (
      !popupId &&
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest(POPUP_SURFACE_SELECTOR)
    ) {
      return;
    }
    if (shouldSuppressMouseLeaveClose()) {
      return;
    }
    // 子孫へ抜ける時だけ枝を維持し、それ以外の遷移は種類に関係なく現在のpopupを閉じる。
    onSurfaceMouseLeave?.();
    setIsHovering(false);
    if (!closeOnMouseLeave) {
      return;
    }
    if (closeDisabled) {
      return;
    }
    onCloseRef.current();
  };

  return {
    armMouseLeaveCloseSuppression,
    handleAuxClickCapture,
    handleMouseDownCapture,
    handleMouseEnter,
    handleMouseLeave,
  };
}

export function useThreadPopupLifecycle({
  scopeId = DEFAULT_POPUP_SCOPE_ID,
  // rootRef はAPI互換のため受け取るが、座標系は viewport(clientX/Y) を直接使うので未使用。
  resMap,
}: ThreadPopupLifecycleParams): ThreadPopupLifecycleResult {
  const {
    popups,
    addPopup,
    closePopupById,
    closePopupsByPredicate,
    closeNonContextPopups,
    closePopupChildren,
    isPopupDescendantOf,
    toggleTreePopupPinned,
  } = usePopupManager(scopeId);
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
  const idPopupItems = useMemo(
    () => popups.filter((item): item is IdPopupItem => item.type === "id"),
    [popups],
  );
  const contextMenuItems = useMemo(
    () => popups.filter((item): item is ContextMenuPopupItem => item.type === "contextMenu"),
    [popups],
  );

  const toPageCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    // popup-portal-layer を position:fixed (viewport基準) にしたため、
    // ポップアップ要素の offsetParent もそのレイヤー(=viewport左上)になる。
    // clientX/clientY をそのまま左上座標として渡すのが正しい。
    return { x: clientX, y: clientY };
  }, []);

  const clearAnchorPreviewHideTimer = useCallback(() => {
    if (anchorPreviewHideTimerRef.current != null) {
      window.clearTimeout(anchorPreviewHideTimerRef.current);
      anchorPreviewHideTimerRef.current = null;
    }
  }, []);

  const hideAnchorPreviewsFromDepth = useCallback(
    (depth: number) => {
      closePopupsByPredicate((item) => item.type === "anchor" && item.payload.depth >= depth);
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
      const items = targets.map((num) => resMap.get(num)).filter((res): res is IRes => !!res);
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
        Math.min(anchorRect.left, window.innerWidth - maxWidth - ANCHOR_PREVIEW_GUTTER),
      );
      const vy = Math.max(
        ANCHOR_PREVIEW_GUTTER,
        Math.min(
          anchorRect.bottom + ANCHOR_PREVIEW_OFFSET,
          viewport.bottom - ANCHOR_PREVIEW_GUTTER,
        ),
      );
      const { x, y } = toPageCoords(vx, vy);
      const currentPreview = anchorPreviewsRef.current.find((item) => item.payload.depth === depth);
      if (
        currentPreview &&
        currentPreview.payload.label === label &&
        currentPreview.x === x &&
        currentPreview.y === y &&
        currentPreview.payload.items.length === items.length &&
        currentPreview.payload.items.every((item, index) => item.num === items[index]?.num)
      ) {
        return;
      }

      const parentId = depth > 0 ? anchorPreviewsRef.current[depth - 1]?.id : sourcePopupId;
      // sourcePopupId が設定されている時（popup内のアンカーホバー）は、
      // sourcePopupId の祖先になっているアンカープレビューを閉じてはいけない。
      // hideAnchorPreviewsFromDepth は cascade で子孫ごと閉じるため、
      // 「アンカー → ID → アンカー」の順に操作すると IDポップアップの親アンカーが
      // 消えて IDポップアップ自体も一緒に閉じてしまう問題を防ぐためこの分岐が必要。
      if (sourcePopupId) {
        closePopupsByPredicate(
          (item) =>
            item.type === "anchor" &&
            item.payload.depth >= depth &&
            !isPopupDescendantOf(sourcePopupId, item.id),
        );
      } else {
        hideAnchorPreviewsFromDepth(depth);
      }
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
      closePopupsByPredicate,
      hideAnchorPreviewsFromDepth,
      isPopupDescendantOf,
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
        payload: { resNum, anchorPreviewDepth, pinned: false },
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
    (clientX: number, clientY: number, items: IRes[], title: string, parentId?: string) => {
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

  const hasPopupChild = useCallback(
    (popupId: string) => popups.some((item) => item.parentId === popupId),
    [popups],
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
    idPopupItems,
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
    isPopupDescendantOf,
    toggleTreePopupPinned,
    hasPopupChild,
    hideAnchorPreview,
    hideAnchorPreviewImmediately,
    showAnchorPreview,
  };
}
