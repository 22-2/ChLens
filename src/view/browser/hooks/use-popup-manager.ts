import type React from "react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IRes } from "src/service-container/interfaces";
import { usePopupStore } from "src/view/browser/hooks/popup-manager/popup-store";
import type {
  AnchorPopupItem,
  ContextMenuPopupItem,
  ContextMenuPopupPayload,
  IdPopupItem,
  PopupItem,
  TreePopupItem,
} from "src/view/browser/hooks/popup-manager/types";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
  POPUP_SURFACE_ID_ATTRIBUTE,
  POPUP_SURFACE_SELECTOR,
} from "src/view/browser/utils/constants";
import { getPopupViewportBounds } from "src/view/browser/utils/use-adjust-overflow";
import { getEventTargetElement } from "src/view/browser/utils/utils";

/**
 * Popup managerは、スレッド上に開くpopupをまとめて管理する場所。
 *
 * 「どのpopupを表示するか」だけでなく、popup同士の親子関係や、
 * マウス操作に応じていつ閉じるかも、ここで一つの流れとして扱う。
 *
 * 【まず全体像】
 *
 * ThreadPage
 *   ├─ useThreadPopupManager ── popupを作る・座標を決める
 *   │    └─ usePopupCore ── popup一覧を保存・基本操作を担当する
 *   │         └─ popup-store.ts / popup-graph.ts
 *   └─ PopupRenderer ── popupを画面に描画する
 *        └─ usePopupCloseBehavior ── hoverやoutside clickで閉じる
 *
 * つまり、ThreadPage側が「開くpopup」を決め、storeがその一覧を持ち、
 * PopupRenderer側が一覧を画面に出す、という分担になっている。
 *
 * 【二段に分けている理由】
 *
 * - 下段の `usePopupCore` は、popupの種類やスレッドの内容を知らない共通層。
 *   scopeごとの一覧を読み取り、追加・削除・親子関係の操作だけを担当する。
 * - 上段の `useThreadPopupManager` は、スレッド画面に必要な組み立て役。
 *   `resMap` を使ったレス情報の解決、表示位置の計算、アンカープレビューの
 *   親子関係や遅延タイマーなど、スレッド固有のルールを担当する。
 * - そのため、popupを保存・操作する仕組みと、スレッド上でpopupをどう動かすかを
 *   別々に読めて、それぞれを独立してテストしやすい。
 *
 * 【popup情報の分け方（scope）】
 *
 * - popupの一覧・IDの採番・重なり順（z-index）を `popup-store.ts` に保存する。
 * - `scopeId` は、popupの情報を共有する範囲を表す名前。
 *   ThreadPageでは通常 `tabId` を使うので、別タブのpopupが混ざらない。
 * - 同じscopeで複数の表示部分が動いている間は、同じpopupの情報を共有する。
 *   最後の表示部分が画面から外れたときに、そのscopeの情報を片付ける。
 * - 本番ではstoreを一つ共有し、`createPopupStore` はテストなどで
 *   他のstateから独立したstoreを用意したいときに使う。
 *
 * 【popupの種類と親子関係】
 *
 * - 各popupは `PopupItem` という一件分のデータとして、
 *   種類ごとの表示内容・座標・重なり順を持つ。
 *   たとえばレスツリー、ID検索、コンテキストメニュー、アンカープレビューがある。
 * - `parentId` がpopupの親を指す。親から開いたpopupは同じ枝（branch）に属する。
 *   親を閉じると、その親から開いた子孫もまとめて閉じる。
 * - `popup-graph.ts` はこの親子関係の計算を担当する。
 *   ReactやZustandに依存しない小さな関数に分けているので、関係だけを安全にテストできる。
 *
 * 【popupが動く流れ】
 *
 * - `usePopupCore` は、指定したscopeに対してpopupを追加・削除したり、
 *   枝単位で閉じたり、レスツリーをpinしたりする操作を提供する。
 * - `useThreadPopupManager` はスレッド固有の処理を担当する。
 *   レスからpopupを作り、画面内に収まる座標を計算し、
 *   アンカープレビューの深さ・元になったpopup・遅延タイマーを管理する。
 * - `usePopupCloseBehavior` は画面上の操作を担当する。
 *   popup内のhover、outside click、子popupへの移動を見て閉じるか判断する。
 *
 * 【閉じ方の主なルール】
 *
 * - リンクや中クリックの直後は、mouseleaveだけでpopupを閉じない。
 * - 右クリックでは、メニューを開く前に今あるpopupの枝を閉じない。
 * - コンテキストメニューはmouseleaveでは閉じず、outside clickやRadixのdismissで閉じる。
 * - pinしたレスツリーは一番上のpopupとして扱い、通常popupの一括closeから外す。
 * - アンカープレビューは、深さ・元になったpopup・遅延タイマーを使って親子関係を保つ。
 *
 * 呼び出し側は、これまでどおりこのファイルのimport pathとhook/type名を使える。
 */
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

function getPopupSurfaceId(target: EventTarget | null): string | null {
  const targetElement = getEventTargetElement(target);
  const popupSurface = targetElement?.closest(POPUP_SURFACE_SELECTOR);
  return popupSurface?.getAttribute(POPUP_SURFACE_ID_ATTRIBUTE) ?? null;
}

export interface PopupCoreResult {
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

interface PopupCloseBehaviorParams {
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

interface PopupCloseBehaviorResult {
  armMouseLeaveCloseSuppression: () => void;
  handleAuxClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseDownCapture: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseEnter: (event: React.MouseEvent<HTMLElement>) => void;
  handleMouseLeave: (event: React.MouseEvent<HTMLElement>) => void;
}

export interface ThreadPopupManagerParams {
  scopeId?: string;
  rootRef: RefObject<HTMLDivElement | null>;
  resMap: Map<number, IRes>;
}

export interface ThreadPopupManagerResult {
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

export function usePopupCore(scopeId = DEFAULT_POPUP_SCOPE_ID): PopupCoreResult {
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

export function usePopupCloseBehavior({
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
}: PopupCloseBehaviorParams): PopupCloseBehaviorResult {
  const [isHovering, setIsHovering] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const suppressNextDisableReleaseCloseRef = useRef(false);

  // close判定とmouseleave抑止は同じsurfaceイベントの順序に依存するため、
  // 別hookを経由せず、このhook内で一体として管理する。
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

export function useThreadPopupManager({
  scopeId = DEFAULT_POPUP_SCOPE_ID,
  // rootRef はAPI互換のため受け取るが、座標系は viewport(clientX/Y) を直接使うので未使用。
  resMap,
}: ThreadPopupManagerParams): ThreadPopupManagerResult {
  const {
    popups,
    addPopup,
    closePopupById,
    closePopupsByPredicate,
    closeNonContextPopups,
    closePopupChildren,
    isPopupDescendantOf,
    toggleTreePopupPinned,
  } = usePopupCore(scopeId);
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
