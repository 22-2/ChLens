import { useCallback } from "react";
import { createLogger } from "src/app/logger";
import type { useThreadData } from "src/features/thread/browser/use-thread-data";
import { container } from "src/service-container/index";
import type { ThreadPage as ThreadPageType } from "src/view/browser/types";
import { countNewRepliesToWrittenResponses } from "src/view/browser/utils/thread-emphasis";

const logger = createLogger("view/browser");

type ThreadDataResult = ReturnType<typeof useThreadData>;

/** 新着レスの中に自分のレスへの返信があれば、スレッド単位で通知を出す。 */
export function useThreadReplyNotification({
  page,
  responses,
  ownResNums,
  replyToOwnResNums,
  viewWindow,
}: {
  page: ThreadPageType;
  responses: ThreadDataResult["responses"];
  ownResNums: ReadonlySet<number>;
  replyToOwnResNums: ReadonlySet<number>;
  viewWindow: Window;
}) {
  const handleNewResponses = useCallback(
    (count: number, previousLastResponseNum: number | null) => {
      const replyCount = countNewRepliesToWrittenResponses(
        responses,
        ownResNums,
        replyToOwnResNums,
        previousLastResponseNum,
        count,
      );

      // 自動更新の共通hookは新着数だけを扱い、通知対象である「自分への返信」は
      // スレッド固有の履歴・返信インデックスを持つ画面側で絞り込む。
      if (replyCount === 0) {
        return;
      }

      if (!container.notification.isSupported(viewWindow)) {
        return;
      }

      void container.notification
        .notify(`自分のレスへの返信: ${page.title}`, {
          message: `${replyCount}件の返信があります`,
          url: page.threadUrl,
          tag: `thread-reply-to-own:${page.threadUrl}`,
          targetWindow: viewWindow,
        })
        .catch((error: unknown) => {
          logger.error("新着レス通知の表示に失敗しました:", error);
        });
    },
    [ownResNums, page.threadUrl, page.title, replyToOwnResNums, responses, viewWindow],
  );
  return handleNewResponses;
}
