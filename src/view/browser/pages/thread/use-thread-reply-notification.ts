import { useCallback, useEffect, useRef } from "react";
import { createLogger } from "src/app/logger";
import type { useThreadData } from "src/features/thread/browser/use-thread-data";
import { container } from "src/service-container/index";
import { useLatestRef } from "src/view/browser/hooks/use-latest-ref";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { findNewRepliesToWrittenResponses } from "src/view/browser/utils/thread-emphasis";

const logger = createLogger("view/browser");

type ThreadDataResult = ReturnType<typeof useThreadData>;

/**
 * 新着レスの中に自分のレスへの返信があれば、スレッド単位で通知を出す。
 *
 * 通知は返信が画面に表示されたタイミングで出す。ライブチャット風の表示では取得直後のレスが
 * 入場アニメーションの後に表示されるため、取得時点で通知すると表示より先に知らせてしまう。
 * displayedResNums は表示済みのレス番号集合。undefined のときは取得分がすべて表示済みとみなす。
 */
export function useThreadReplyNotification({
  page,
  responses,
  ownResNums,
  replyToOwnResNums,
  displayedResNums,
}: {
  page: ThreadPageType;
  responses: ThreadDataResult["responses"];
  ownResNums: ReadonlySet<number>;
  replyToOwnResNums: ReadonlySet<number>;
  displayedResNums?: ReadonlySet<number>;
}) {
  const { window: viewWindow } = useViewSurface();
  const displayedRef = useLatestRef(displayedResNums);
  // 取得済みだが、まだ表示されていない自分のレスへの返信。
  const pendingRepliesRef = useRef(new Set<number>());

  useEffect(() => {
    // 別スレッドへ移ったあとに、前のスレッドの保留分を通知へ混ぜないようにする。
    pendingRepliesRef.current.clear();
  }, [page.threadUrl]);

  const notifyDisplayedReplies = useCallback(() => {
    const displayed = displayedRef.current;
    const shownNums = [...pendingRepliesRef.current].filter(
      (num) => displayed == null || displayed.has(num),
    );
    if (shownNums.length === 0) {
      return;
    }
    for (const num of shownNums) {
      pendingRepliesRef.current.delete(num);
    }

    if (!container.notification.isSupported(viewWindow)) {
      return;
    }

    void container.notification
      .notify(`自分のレスへの返信: ${page.title}`, {
        message: `${shownNums.length}件の返信があります`,
        url: page.threadUrl,
        tag: `thread-reply-to-own:${page.threadUrl}`,
        targetWindow: viewWindow,
      })
      .catch((error: unknown) => {
        logger.error("新着レス通知の表示に失敗しました:", error);
      });
  }, [displayedRef, page.threadUrl, page.title, viewWindow]);

  // 返信の表示が完了すると表示済み集合が更新されるため、その時点で保留分を通知する。
  useEffect(() => {
    notifyDisplayedReplies();
  }, [displayedResNums, notifyDisplayedReplies]);

  const handleNewResponses = useCallback(
    (count: number, previousLastResponseNum: number | null) => {
      const replyNums = findNewRepliesToWrittenResponses(
        responses,
        ownResNums,
        replyToOwnResNums,
        previousLastResponseNum,
        count,
      );
      for (const num of replyNums) {
        pendingRepliesRef.current.add(num);
      }
      // 表示済みの返信があればすぐ通知し、未表示の分は表示完了のタイミングまで残す。
      notifyDisplayedReplies();
    },
    [notifyDisplayedReplies, ownResNums, replyToOwnResNums, responses],
  );
  return handleNewResponses;
}
