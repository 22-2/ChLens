import { useCallback, useRef, useState } from "react";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import type { IRes } from "src/service-container/interfaces";
import { resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";

/** 自動保存で既読が進んでも線を動かさず、スレごとに開いた時・更新時の位置を持つ。 */
export function useThreadReadBoundary(threadUrl: string) {
  const ngDisplayMode = useNgDisplayMode();
  const ngDisabled = useIsNgTemporarilyDisabled();
  const isVisible = useCallback(
    (res: IRes) =>
      ngDisabled ||
      (res.ng == null && !res.class?.includes("ng")) ||
      resolveNgDisplayMode(ngDisplayMode, res.ng) !== "hard-ng",
    [ngDisabled, ngDisplayMode],
  );
  const [snapshot, setSnapshot] = useState<{ threadUrl: string; read: number | null } | null>(null);
  const refreshSuccessRef = useRef<(() => void) | null>(null);
  const setBoundary = useCallback(
    (read: number | null) => setSnapshot({ threadUrl, read }),
    [threadUrl],
  );
  return {
    read: snapshot?.threadUrl === threadUrl ? snapshot.read : null,
    setBoundary,
    isVisible,
    refreshSuccessRef,
  };
}

/** 絞り込み中の見かけの境界や、全件既読なのに未読があるように見せる線を避ける。 */
export function getReadBoundaryIndex<T extends { num: number }>(
  responses: readonly T[],
  read: number | null,
  mode: "auto" | "manual",
  hidden: boolean,
  isVisible: (response: T) => boolean = () => true,
): number {
  if (hidden || responses.length === 0 || read == null || read <= 0) return -1;
  const next = responses.findIndex((response) => response.num > read);
  // 完全非表示のNGレスだけが未読なら、末尾に未読線だけが残るのを防ぐ。
  if (mode === "auto" && next >= 0 && !responses.slice(next).some(isVisible)) return -1;
  return next >= 0 ? next : mode === "manual" ? responses.length : -1;
}
