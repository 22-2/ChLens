import { PlayCircle } from "lucide-react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { parseArchiveReplayTimestamp } from "src/features/archive-replay/domain/archive-replay";
import { threadKeyToEpochSeconds } from "src/features/archive-replay/domain/thread-collection/collection-window";
import { requestArchiveReplayPreparation } from "src/features/archive-replay/platform";
import { container } from "src/service-container";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";

const logger = createLogger("archive-replay");

/** 過去実況再生機能が所有する起動コマンドを登録する。 */
export function registerArchiveReplayCommands(api: ExtensionApi): void {
  api.addCommand(
    {
      id: "archive-replay.prepare-from-thread",
      label: "このスレから過去実況リプレイを準備",
      englishLabel: "Prepare Archive Replay from Thread",
      description: "現在のスレを起点に実況スレを集めます",
      keywords: ["過去実況", "リプレイ準備", "replay"],
      group: "page",
      icon: PlayCircle,
      when: ({ viewPage }) => isTauriRuntime() && viewPage.type === "thread",
      run: async ({ viewPage }) => {
        if (!isTauriRuntime() || viewPage.type !== "thread") return;
        const threadUrl = viewPage.threadUrl;
        const title = viewPage.title || threadUrl;
        const key = /\/(\d{10})(?:\.dat)?(?:\/|$)/.exec(new URL(threadUrl).pathname)?.[1];
        let createdAtSeconds = key ? threadKeyToEpochSeconds(key) : null;
        if (createdAtSeconds === null) {
          try {
            const thread = await container.thread.getThread(threadUrl);
            const timestamp = parseArchiveReplayTimestamp(thread.res[0]?.date ?? "");
            createdAtSeconds = timestamp === null ? null : Math.floor(timestamp / 1000);
            logger.info("スレキーの代わりに最初のレスの日時を使用します", {
              threadUrl,
              createdAtSeconds,
            });
          } catch (error) {
            logger.error("種スレの投稿日時を取得できませんでした", { threadUrl, error });
          }
        }
        try {
          await requestArchiveReplayPreparation({
            version: 1,
            threadUrl,
            title,
            ...(createdAtSeconds === null ? {} : { createdAtSeconds }),
          });
        } catch (error) {
          logger.error("過去実況の準備を開けませんでした", error);
          throw error;
        }
      },
    },
    { beforeCommandId: "filter.toggle" },
  );
  api.addCommand(
    {
      id: "archive-replay.open",
      label: "過去実況再生を開く",
      englishLabel: "Open Archive Replay",
      description: "複数の実況スレッドを投稿時刻順につないで再生します",
      keywords: ["過去実況", "実況再生", "コメント再生", "archive replay", "replay"],
      group: "navigation",
      icon: PlayCircle,
      when: () => isTauriRuntime(),
      // 変更理由: 過去ログ検索とは別に、複数スレッドを時刻順で再生する入口を
      // Tauri版のコマンドパレットへ限定して公開し、ブラウザ版で未対応の再生窓を
      // 誤って開かないようにする。
      run: ({ openArchiveReplayWindow }) => {
        if (!isTauriRuntime()) return;
        openArchiveReplayWindow();
      },
    },
    { beforeCommandId: "navigation.open-siki-log" },
  );
}
