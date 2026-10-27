import { MessageSquare } from "lucide-react";
import { createLogger } from "src/app/logger";
import { isTauriRuntime } from "src/app/platform/runtime";
import { commentOverlayController } from "src/features/comment-overlay/application";
import { toggleCommentOverlayFlow } from "src/features/comment-overlay/application/flow-toggle";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";

const logger = createLogger("comment-overlay");

/** 共有コントローラーの操作を機能自身が登録し、開始時だけ実行元のスレを使う。 */
export function registerCommentOverlayCommands(api: ExtensionApi): void {
  api.addCommand({
    id: "comment-overlay.toggle",
    label: "コメント実況を切り替え",
    englishLabel: "Toggle Comment Overlay",
    description: "実況中なら表示を切り替え、停止中なら表示中のスレッドの実況を開始します",
    keywords: ["実況", "コメント", "overlay", "コメント実況"],
    group: "page",
    icon: MessageSquare,
    when: () => isTauriRuntime(),
    run: ({ viewPage }) => {
      const threadUrl = viewPage.type === "thread" ? viewPage.threadUrl : null;
      // 従来のイベント経由と同じく処理の完了は待たず、失敗は機能のログへ残す。
      void toggleCommentOverlayFlow(
        commentOverlayController,
        commentOverlayController.getSnapshot(),
        threadUrl,
      ).catch((error: unknown) => {
        logger.error("コマンドからのコメント実況切り替えに失敗しました:", error);
      });
    },
  });
}
