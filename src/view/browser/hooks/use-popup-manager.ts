import { useCallback, useRef, useState } from "react";
import { POPUP_BASE_Z } from "src/view/browser/utils/constants";
import type { PopupItem } from "src/view/browser/utils/types";

export interface PopupManagerResult {
  popups: PopupItem[];
  addPopup: (popup: Omit<PopupItem, "id" | "z">) => string;
  closePopupById: (id: string) => void;
  closeAllPopups: () => void;
  closePopupsByPredicate: (predicate: (item: PopupItem) => boolean) => void;
}

export function usePopupManager(): PopupManagerResult {
  const [popups, setPopups] = useState<PopupItem[]>([]);
  const zCounterRef = useRef(POPUP_BASE_Z);
  const idCounterRef = useRef(0);

  const addPopup = useCallback((popup: Omit<PopupItem, "id" | "z">) => {
    const id = `${popup.type}-${++idCounterRef.current}`;
    const z = ++zCounterRef.current;
    const next = { ...popup, id, z } as PopupItem;
    setPopups((prev) => [...prev, next]);
    return id;
  }, []);

  const closePopupsByPredicate = useCallback(
    (predicate: (item: PopupItem) => boolean) => {
      setPopups((prev) => {
        const removedIds = new Set<string>();
        for (const item of prev) {
          if (predicate(item)) {
            removedIds.add(item.id);
          }
        }

        // parentId ツリーをたどって閉じることで、今後スタックの並びが変わっても
        // 親を閉じた時に子メニュー/子ポップアップが取り残されないようにする。
        let changed = true;
        while (changed) {
          changed = false;
          for (const item of prev) {
            if (!item.parentId || removedIds.has(item.id)) continue;
            if (removedIds.has(item.parentId)) {
              removedIds.add(item.id);
              changed = true;
            }
          }
        }

        return prev.filter((item) => !removedIds.has(item.id));
      });
    },
    [],
  );

  const closePopupById = useCallback((id: string) => {
    closePopupsByPredicate((item) => item.id === id);
  }, [closePopupsByPredicate]);

  const closeAllPopups = useCallback(() => {
    setPopups([]);
  }, []);

  return {
    popups,
    addPopup,
    closePopupById,
    closeAllPopups,
    closePopupsByPredicate,
  };
}
