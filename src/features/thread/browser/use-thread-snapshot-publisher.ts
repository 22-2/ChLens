import { useEffect, useMemo, useState } from "react";
import {
  useIsNgTemporarilyDisabled,
  useNgDisplayMode,
} from "src/features/ng/browser/use-ng-status";
import type { IRes } from "src/service-container/interfaces";
import {
  publishThreadSnapshot,
  removeThreadSnapshot,
  type ThreadSnapshot,
} from "src/view/browser/state/thread-snapshot";
import { resolveNgDisplayMode } from "src/view/browser/utils/ng-display-mode";

type PublishedFields = Omit<ThreadSnapshot, "visibleResponses" | "updatedAt">;

interface ThreadSnapshotPublisherOptions extends PublishedFields {
  tabId: string;
  /** 過去ログ再生中など、補助ビューへ公開しない状態では false にする。 */
  enabled: boolean;
  /** 本文の絞り込み後のレス。NG で隠れたレスはここで除き、強調表示モードのものは残す。 */
  visibleResponses: readonly IRes[];
}

/**
 * スレの取得結果を、サイドパネルなどの補助ビューへ読み取り専用で公開する。
 * 表示面ごとに取得を重複させず、このタブの最新結果だけを共有する。
 * タブごとの所有者トークンで、古い画面の解除が新しい公開を消さないようにする。
 */
export function useThreadSnapshotPublisher({
  tabId,
  enabled,
  threadUrl,
  responses,
  visibleResponses,
  replyIndex,
  messageProtocol,
  blurredResNums,
  imageBlurRadius,
  loading,
  error,
  expired,
}: ThreadSnapshotPublisherOptions): void {
  const [owner] = useState(() => Symbol("thread-snapshot"));
  const isNgDisabled = useIsNgTemporarilyDisabled();
  const ngMode = useNgDisplayMode();
  const shownResponses = useMemo(
    () =>
      visibleResponses.filter(
        (res) =>
          isNgDisabled ||
          !(res.ng || res.class?.includes("ng")) ||
          resolveNgDisplayMode(ngMode, res.ng) === "highlight-ng",
      ),
    [visibleResponses, isNgDisabled, ngMode],
  );

  useEffect(() => () => removeThreadSnapshot(tabId, owner), [tabId, owner]);
  useEffect(() => {
    if (!enabled) {
      removeThreadSnapshot(tabId, owner);
      return;
    }
    publishThreadSnapshot(tabId, owner, {
      threadUrl,
      responses,
      visibleResponses: shownResponses,
      replyIndex,
      messageProtocol,
      blurredResNums,
      imageBlurRadius,
      updatedAt: Date.now(),
      loading,
      error,
      expired,
    });
  }, [
    tabId,
    owner,
    enabled,
    threadUrl,
    responses,
    shownResponses,
    replyIndex,
    messageProtocol,
    blurredResNums,
    imageBlurRadius,
    loading,
    error,
    expired,
  ]);
}
