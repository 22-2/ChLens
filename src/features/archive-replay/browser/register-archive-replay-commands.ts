import { PlayCircle } from "lucide-react";
import { isTauriRuntime } from "src/app/platform/runtime";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";

/** 過去実況再生機能が所有する起動コマンドを登録する。 */
export function registerArchiveReplayCommands(api: ExtensionApi): void {
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
      // 変更理由: 過去ログ検索とは別に、複数スレッドを時刻順でつなぐ入口をTauri版に限定する。
      run: ({ openArchiveReplayWindow }) => {
        if (!isTauriRuntime()) return;
        openArchiveReplayWindow();
      },
    },
    { beforeCommandId: "navigation.open-siki-log" },
  );
}
