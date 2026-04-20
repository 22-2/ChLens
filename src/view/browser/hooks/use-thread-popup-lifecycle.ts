import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { IRes } from "src/service-container/interfaces";
import { usePopupManager } from "src/view/browser/hooks/use-popup-manager";
import {
  ANCHOR_PREVIEW_GUTTER,
  ANCHOR_PREVIEW_HIDE_DELAY_MS,
  ANCHOR_PREVIEW_MAX_WIDTH,
  ANCHOR_PREVIEW_OFFSET,
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

interface ThreadPopupLifecycleParams {
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

export function useThreadPopupLifecycle({
  rootRef,
  resMap,
}: ThreadPopupLifecycleParams): ThreadPopupLifecycleResult {
  const { popups, addPopup, closePopupById, closePopupsByPredicate } =
    usePopupManager();
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
    [addPopup, clearAnchorPreviewHideTimer, hideAnchorPreviewsFromDepth, resMap, toPageCoords],
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
