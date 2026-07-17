import type { MouseEvent } from "react";
import { useCallback } from "react";
import type { IRes } from "src/service-container/interfaces";
import type { ThreadPopupLifecycleResult } from "src/view/browser/hooks/use-popup-manager";
import { resolveReplyTreeRootResNum } from "src/view/browser/utils/reply-tree-root";

interface Indexes {
  resMap: Map<number, IRes>;
  idIndex: Map<string, Set<number>>;
  repIndex: Map<number, Set<number>>;
  ancIndex: Map<number, Set<number>>;
}

interface UseResInteractionHandlersParams extends Pick<
  ThreadPopupLifecycleResult,
  | "addTreePopup"
  | "addIdPopup"
  | "showAnchorPreview"
  | "hideAnchorPreview"
  | "hideAnchorPreviewImmediately"
  | "clearAnchorPreviewHideTimer"
  | "closeNonContextPopups"
> {
  indexes: Indexes;
  scrollToResponse: (
    resNum: number,
    options?: { highlight?: boolean; offset?: number },
  ) => void;
}

export function useResInteractionHandlers({
  indexes,
  addTreePopup,
  addIdPopup,
  showAnchorPreview,
  hideAnchorPreview,
  hideAnchorPreviewImmediately,
  clearAnchorPreviewHideTimer,
  closeNonContextPopups,
  scrollToResponse,
}: UseResInteractionHandlersParams) {
  const openAnchorPreviewFromPopup = useCallback(
    (popupId: string) =>
      (
        targets: number[],
        anchorRect: DOMRect,
        label: string,
        depth: number,
      ) => {
        // depth=0 のアンカーは popup 内から開かれたことを親子ツリーへ残さないと、
        // その後の返信/右クリックメニューで root 扱いになって祖先との寿命がずれる。
        showAnchorPreview(targets, anchorRect, label, depth, popupId);
      },
    [showAnchorPreview],
  );

  // IDクリック → そのIDの全レスをポップアップ表示
  const handleIdClick = useCallback(
    (id: string, e: MouseEvent) => {
      // message 内の anchor_id は ID: 付き、ヘッダー側は生値、のように揺れることがあるため
      // 両方を試して同じIDインデックスへ合流させる。
      const candidateIds = id.startsWith("ID:")
        ? [id, id.replace(/^ID:/i, "")]
        : [id, `ID:${id}`];
      const resolvedId = candidateIds.find((candidate) =>
        indexes.idIndex.has(candidate),
      );
      const resNums = resolvedId ? indexes.idIndex.get(resolvedId) : undefined;
      if (!resNums) return;
      hideAnchorPreviewImmediately();
      const items = Array.from(resNums)
        .sort((a, b) => a - b)
        .map((num) => indexes.resMap.get(num))
        .filter((r): r is IRes => !!r);
      closeNonContextPopups();
      const displayId = (resolvedId ?? id).startsWith("ID:")
        ? (resolvedId ?? id)
        : `ID:${resolvedId ?? id}`;
      addIdPopup(
        e.clientX,
        e.clientY,
        items,
        `${displayId} (${items.length}件)`,
      );
    },
    [indexes, hideAnchorPreviewImmediately, closeNonContextPopups, addIdPopup],
  );

  const handlePopupIdClick = useCallback(
    (parentId: string) => (id: string, e: MouseEvent) => {
      // popup内クリックは親popupスタックを維持し、子としてID popupを開く。
      // ここで全閉じすると「anchor_idで開いた瞬間に親が消える」ため closeNonContextPopups は呼ばない。
      const candidateIds = id.startsWith("ID:")
        ? [id, id.replace(/^ID:/i, "")]
        : [id, `ID:${id}`];
      const resolvedId = candidateIds.find((candidate) =>
        indexes.idIndex.has(candidate),
      );
      const resNums = resolvedId ? indexes.idIndex.get(resolvedId) : undefined;
      if (!resNums) return;
      clearAnchorPreviewHideTimer();
      const items = Array.from(resNums)
        .sort((a, b) => a - b)
        .map((num) => indexes.resMap.get(num))
        .filter((r): r is IRes => !!r);
      const displayId = (resolvedId ?? id).startsWith("ID:")
        ? (resolvedId ?? id)
        : `ID:${resolvedId ?? id}`;
      addIdPopup(
        e.clientX,
        e.clientY,
        items,
        `${displayId} (${items.length}件)`,
        parentId,
      );
    },
    [addIdPopup, clearAnchorPreviewHideTimer, indexes.idIndex, indexes.resMap],
  );

  // 返信クリック → 返信ツリーをポップアップ表示（スレッド本文から）
  const handleRepClick = useCallback(
    (resNum: number, e: MouseEvent) => {
      hideAnchorPreviewImmediately();
      closeNonContextPopups();
      addTreePopup(resNum, e.clientX, e.clientY);
    },
    [hideAnchorPreviewImmediately, closeNonContextPopups, addTreePopup],
  );

  const closePopup = useCallback(() => {
    hideAnchorPreviewImmediately();
    closeNonContextPopups();
  }, [hideAnchorPreviewImmediately, closeNonContextPopups]);

  // ポップアップ/アンカープレビュー内からの返信クリック。
  // アンカープレビューを即時消去せず、スタックに積んで親子関係を維持する。
  const handleRepClickInPopup = useCallback(
    (parentId?: string, anchorPreviewDepth = 0) =>
      (resNum: number, e: MouseEvent) => {
        clearAnchorPreviewHideTimer();
        // アンカープレビュー配下で開いた返信ツリーは、その深さを持ち回って
        // 次のアンカーホバーでも親プレビューを巻き込んで閉じないようにする。
        addTreePopup(
          resNum,
          e.clientX,
          e.clientY,
          parentId,
          anchorPreviewDepth,
        );
      },
    [addTreePopup, clearAnchorPreviewHideTimer],
  );

  const handleOpenRootReplyTreeInPopup = useCallback(
    (parentId?: string, anchorPreviewDepth = 0) =>
      (resNum: number, e: MouseEvent) => {
        clearAnchorPreviewHideTimer();
        // 葉のアンカーから辿る時は起点レスを ancIndex で逆引きしてから開くことで、
        // 相互アンカーが続くケースでも最初の流れを辿りやすくする。
        const rootResNum = resolveReplyTreeRootResNum(
          resNum,
          indexes.ancIndex,
          indexes.resMap,
        );
        addTreePopup(
          rootResNum,
          e.clientX,
          e.clientY,
          parentId,
          anchorPreviewDepth,
        );
      },
    [
      addTreePopup,
      clearAnchorPreviewHideTimer,
      indexes.ancIndex,
      indexes.resMap,
    ],
  );

  // アンカークリックで該当レスへスクロール
  const handleAnchorClick = useCallback(
    (resNum: number) => {
      // ポップアップ上のアンカークリックでも遷移先を確実に視認できるよう、
      // ジャンプ時はいったん非メニュー系ポップアップを閉じて本文へフォーカスを戻す。
      closeNonContextPopups();
      scrollToResponse(resNum);
    },
    [closeNonContextPopups, scrollToResponse],
  );

  return {
    openAnchorPreviewFromPopup,
    handleIdClick,
    handlePopupIdClick,
    handleRepClick,
    closePopup,
    handleRepClickInPopup,
    handleOpenRootReplyTreeInPopup,
    handleAnchorClick,
  };
}
