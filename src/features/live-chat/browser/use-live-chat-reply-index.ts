import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

interface DisplayedState {
  scope: string;
  responseNums: ReadonlySet<number>;
}

/** 取得済みの返信関係を、入場表示が完了したレスまでに制限する。 */
export function useLiveChatReplyIndex({
  scopeKey,
  isFlowing,
  baseline,
  responses,
  releasedResponses,
  repIndex,
}: {
  scopeKey: string;
  isFlowing: boolean;
  baseline: number;
  responses: readonly { num: number }[];
  releasedResponses: readonly { num: number }[];
  repIndex: Map<number, Set<number>>;
}) {
  const { window: viewWindow } = useViewSurface();
  const scope = `${scopeKey}\u0000${isFlowing}`;
  const [stored, setDisplayed] = useState<DisplayedState>({
    scope,
    responseNums: new Set(),
  });
  let displayed = stored;
  if (stored.scope !== scope) {
    // 別スレッドや通常表示からの復帰に、前の入場完了番号を持ち込まない。
    displayed = { scope, responseNums: new Set() };
    setDisplayed(displayed);
  }

  const onEntryDisplayed = useCallback(
    (responseNum: number) => {
      setDisplayed((current) => {
        if (current.scope !== scope || current.responseNums.has(responseNum)) return current;
        return { ...current, responseNums: new Set([...current.responseNums, responseNum]) };
      });
    },
    [scope],
  );
  const scheduledRef = useRef<{ nums: Set<number>; timers: Set<number> }>({
    nums: new Set(),
    timers: new Set(),
  });
  useEffect(() => {
    const scheduled = { nums: new Set<number>(), timers: new Set<number>() };
    scheduledRef.current = scheduled;
    return () => {
      for (const timer of scheduled.timers) viewWindow.clearTimeout(timer);
    };
  }, [scope, viewWindow]);
  useEffect(() => {
    if (!isFlowing) return;
    const scheduled = scheduledRef.current;
    const nums = releasedResponses
      .filter((res) => res.num > baseline && !scheduled.nums.has(res.num))
      .map((res) => res.num);
    if (!nums.length) return;
    for (const num of nums) scheduled.nums.add(num);
    // 高速で流れると仮想化されたレスは描画されず、animationendが届かない。
    // 描画済みの入場完了を優先しつつ、十分な待機後に残りも返信数へ反映する。
    const timer = viewWindow.setTimeout(() => {
      scheduled.timers.delete(timer);
      setDisplayed((current) => {
        if (current.scope !== scope || nums.every((num) => current.responseNums.has(num)))
          return current;
        return { ...current, responseNums: new Set([...current.responseNums, ...nums]) };
      });
    }, 300);
    scheduled.timers.add(timer);
  }, [scope, isFlowing, baseline, releasedResponses, viewWindow]);

  const replySourceNums = useMemo(
    () =>
      isFlowing
        ? new Set(
            responses
              .filter((res) => res.num <= baseline || displayed.responseNums.has(res.num))
              .map((res) => res.num),
          )
        : undefined,
    [baseline, displayed.responseNums, isFlowing, responses],
  );
  const displayedRepIndex = useMemo(() => {
    if (replySourceNums == null) return repIndex;
    const result = new Map<number, Set<number>>();
    for (const [target, sourceNums] of repIndex) {
      const displayedSources = new Set([...sourceNums].filter((num) => replySourceNums.has(num)));
      if (displayedSources.size > 0) result.set(target, displayedSources);
    }
    return result;
  }, [repIndex, replySourceNums]);

  return { repIndex: displayedRepIndex, replySourceNums, onEntryDisplayed };
}
