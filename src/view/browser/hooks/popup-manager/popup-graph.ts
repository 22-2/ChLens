import type { PopupItem } from "src/view/browser/hooks/popup-manager/types";

/**
 * 指定したpopupと、そのparentId配下にある全てのpopup IDを収集する。
 *
 * popupの追加順やstackの並びには依存せず、parentIdだけを規則として扱う。
 * 壊れたparentIdや循環したグラフが渡されても、Setで訪問済みを管理して終了を保証する。
 */
export function collectPopupBranchIds(popups: PopupItem[], rootIds: Iterable<string>): Set<string> {
  const branchIds = new Set(rootIds);
  const childIdsByParentId = new Map<string, string[]>();

  for (const popup of popups) {
    if (!popup.parentId) {
      continue;
    }

    const childIds = childIdsByParentId.get(popup.parentId) ?? [];
    childIds.push(popup.id);
    childIdsByParentId.set(popup.parentId, childIds);
  }

  const pendingParentIds = [...branchIds];
  while (pendingParentIds.length > 0) {
    const parentId = pendingParentIds.pop();
    if (parentId == null) {
      continue;
    }

    for (const childId of childIdsByParentId.get(parentId) ?? []) {
      if (branchIds.has(childId)) {
        continue;
      }

      branchIds.add(childId);
      pendingParentIds.push(childId);
    }
  }

  return branchIds;
}

export function isPopupDescendantOf(
  popups: PopupItem[],
  popupId: string,
  ancestorId: string,
): boolean {
  const popupsById = new Map(popups.map((item) => [item.id, item]));
  const visitedIds = new Set<string>();
  let currentId = popupsById.get(popupId)?.parentId;

  // parentIdを逆向きにたどるため、循環グラフでも同じIDを再訪しない。
  while (currentId) {
    if (currentId === ancestorId) {
      return true;
    }
    if (visitedIds.has(currentId)) {
      break;
    }
    visitedIds.add(currentId);
    currentId = popupsById.get(currentId)?.parentId;
  }

  return false;
}

/**
 * predicateに一致したpopupをrootとして、その子孫を含むbranchを削除した配列を返す。
 * 入力配列は変更しないため、Zustandのstate更新とは独立してcascade規則を検証できる。
 */
export function removePopupBranches(
  popups: PopupItem[],
  predicate: (item: PopupItem) => boolean,
): PopupItem[] {
  const rootIds = popups.filter(predicate).map((item) => item.id);
  const branchIds = collectPopupBranchIds(popups, rootIds);
  return popups.filter((item) => !branchIds.has(item.id));
}
