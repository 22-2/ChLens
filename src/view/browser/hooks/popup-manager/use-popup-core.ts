import { useCallback, useEffect } from "react";
import { usePopupStore } from "src/view/browser/hooks/popup-manager/popup-store";
import type { PopupItem } from "src/view/browser/hooks/popup-manager/types";

const DEFAULT_POPUP_SCOPE_ID = "default";
const EMPTY_POPUPS: PopupItem[] = [];

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
  toggleIdPopupPinned: (popupId: string) => void;
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
  const toggleIdPopupPinnedInScope = usePopupStore((state) => state.toggleIdPopupPinnedInScope);

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
  const toggleIdPopupPinned = useCallback(
    (popupId: string) => toggleIdPopupPinnedInScope(scopeId, popupId),
    [scopeId, toggleIdPopupPinnedInScope],
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
    toggleIdPopupPinned,
  };
}
