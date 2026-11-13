import { useCallback, useRef, useState } from "react";

/** 自動保存で既読が進んでも線を動かさず、スレごとに開いた時・更新時の位置を持つ。 */
export function useThreadReadBoundary(threadUrl: string) {
  const [snapshot, setSnapshot] = useState<{ threadUrl: string; read: number | null } | null>(null);
  const refreshSuccessRef = useRef<(() => void) | null>(null);
  const setBoundary = useCallback(
    (read: number | null) => setSnapshot({ threadUrl, read }),
    [threadUrl],
  );
  return {
    read: snapshot?.threadUrl === threadUrl ? snapshot.read : null,
    setBoundary,
    refreshSuccessRef,
  };
}

/** 絞り込み中の見かけの境界や、全件既読なのに未読があるように見せる線を避ける。 */
export function getReadBoundaryIndex(
  responses: readonly { num: number }[],
  read: number | null,
  mode: "auto" | "manual",
  hidden: boolean,
): number {
  if (hidden || responses.length === 0 || read == null || read <= 0) return -1;
  const next = responses.findIndex((response) => response.num > read);
  return next >= 0 ? next : mode === "manual" ? responses.length : -1;
}
