import { Search } from "lucide-react";
import { AUTO_NEXT_THREAD_CONFIG_KEY } from "src/features/next-thread/browser/use-auto-next-thread-setting";
import {
  isCommandConfigSwitchOn,
  toggleCommandConfigSwitch,
} from "src/view/browser/commands/command-definition";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";

/** 次スレ機能が所有する検索・設定コマンドを登録する。 */
export function registerNextThreadCommands(api: ExtensionApi): void {
  api.addCommand(
    {
      id: "next-thread.search",
      label: "次スレ候補を検索",
      englishLabel: "Find Next Thread Candidates",
      description: "積極判定で現在のスレに続く候補を一覧表示します",
      keywords: ["次スレ", "候補", "thread", "next", "search"],
      group: "page",
      icon: Search,
      when: ({ viewPage }) => viewPage.type === "thread",
      run: ({ openNextThreadSearchDialog }) => openNextThreadSearchDialog(),
    },
    { beforeCommandId: "page.toggle-filter" },
  );
  api.addCommand(
    {
      id: "next-thread.search-related",
      label: "関連スレを検索",
      englishLabel: "Find Related Threads",
      description: "タイトルや話題が関連するスレと次スレ候補を板一覧から検索します",
      keywords: ["関連スレ", "関連するスレ", "related", "thread", "search"],
      group: "page",
      icon: Search,
      when: ({ viewPage }) => viewPage.type === "thread",
      run: ({ openRelatedThreadSearchDialog }) => openRelatedThreadSearchDialog?.(),
    },
    { beforeCommandId: "page.toggle-filter" },
  );
  api.addCommand(
    {
      id: "next-thread.toggle-auto",
      label: () =>
        isCommandConfigSwitchOn(AUTO_NEXT_THREAD_CONFIG_KEY)
          ? "自動次スレを無効にする"
          : "自動次スレを有効にする",
      englishLabel: () =>
        isCommandConfigSwitchOn(AUTO_NEXT_THREAD_CONFIG_KEY)
          ? "Disable Auto Next Thread"
          : "Enable Auto Next Thread",
      description: "スレッドが上限に近づいたときに次スレを自動で探す設定を切り替えます",
      keywords: ["次スレ", "自動次スレ", "next thread", "自動"],
      group: "page",
      icon: Search,
      run: () => toggleCommandConfigSwitch(AUTO_NEXT_THREAD_CONFIG_KEY),
    },
    { beforeCommandId: "layout.toggle-zen-mode" },
  );
}
