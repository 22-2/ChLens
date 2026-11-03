import { Filter } from "lucide-react";
import {
  type BrowserCommandContext,
  type BrowserCommandDefinition,
  getCommandSurface,
} from "src/view/browser/commands/command-definition";
import type { ExtensionApi } from "src/view/browser/extension/extension-api";
import {
  toggleFilter as toggleFilterForTab,
  toggleThreadFilterMode,
} from "src/view/browser/extension/page-actions";
import type { ThreadFilter } from "src/view/browser/types";
import { isPageFilterable } from "src/view/browser/utils/filterable-pages";

function toggleFilter(context: BrowserCommandContext): void {
  const { window: viewWindow } = getCommandSurface(context);
  toggleFilterForTab(viewWindow, context.viewTab.id);
}

function dispatchThreadFilterModeToggle(
  context: BrowserCommandContext,
  filter: Exclude<ThreadFilter, "all">,
): void {
  const { window: viewWindow } = getCommandSurface(context);
  toggleThreadFilterMode(viewWindow, context.viewTab.id, filter);
}

// 変更理由: フィルタメニューと同じ各モードを、それぞれ選択・解除できるパレット項目として並べる。
const THREAD_FILTER_MODE_COMMANDS: readonly BrowserCommandDefinition[] = [
  {
    id: "filter.toggle-popular",
    label: "人気レスのフィルタを切り替え",
    englishLabel: "Toggle Popular Filter",
    description: "人気レスだけに絞り込みます。選択中にもう一度実行すると解除します",
    keywords: ["人気", "popular", "絞り込み", "フィルタ"],
    group: "page",
    icon: Filter,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: (context) => dispatchThreadFilterModeToggle(context, "popular"),
  },
  {
    id: "filter.toggle-image",
    label: "画像のフィルタを切り替え",
    englishLabel: "Toggle Image Filter",
    description: "画像を含むレスだけに絞り込みます。選択中にもう一度実行すると解除します",
    keywords: ["画像", "image", "絞り込み", "フィルタ"],
    group: "page",
    icon: Filter,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: (context) => dispatchThreadFilterModeToggle(context, "image"),
  },
  {
    id: "filter.toggle-video",
    label: "動画のフィルタを切り替え",
    englishLabel: "Toggle Video Filter",
    description: "動画を含むレスだけに絞り込みます。選択中にもう一度実行すると解除します",
    keywords: ["動画", "video", "絞り込み", "フィルタ"],
    group: "page",
    icon: Filter,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: (context) => dispatchThreadFilterModeToggle(context, "video"),
  },
  {
    id: "filter.toggle-link",
    label: "外部リンクのフィルタを切り替え",
    englishLabel: "Toggle External Link Filter",
    description: "外部リンクを含むレスだけに絞り込みます。選択中にもう一度実行すると解除します",
    keywords: ["外部", "リンク", "link", "絞り込み", "フィルタ"],
    group: "page",
    icon: Filter,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: (context) => dispatchThreadFilterModeToggle(context, "link"),
  },
  {
    id: "filter.toggle-internal-link",
    label: "内部リンクのフィルタを切り替え",
    englishLabel: "Toggle Internal Link Filter",
    description:
      "同じサイトへのリンクを含むレスだけに絞り込みます。選択中にもう一度実行すると解除します",
    keywords: ["内部", "リンク", "link", "絞り込み", "フィルタ"],
    group: "page",
    icon: Filter,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: (context) => dispatchThreadFilterModeToggle(context, "internalLink"),
  },
  {
    id: "filter.toggle-own",
    label: "自分のレスのフィルタを切り替え",
    englishLabel: "Toggle Own Posts Filter",
    description: "自分が書き込んだレスだけに絞り込みます。選択中にもう一度実行すると解除します",
    keywords: ["自分", "own", "書き込み", "絞り込み", "フィルタ"],
    group: "page",
    icon: Filter,
    when: ({ viewPage }) => viewPage.type === "thread",
    run: (context) => dispatchThreadFilterModeToggle(context, "own"),
  },
];

/** フィルターの操作と表示順を機能側で所有する。 */
export function registerFilterCommands(api: ExtensionApi): void {
  api.addCommand(
    {
      id: "filter.toggle",
      label: "フィルターを切り替え",
      englishLabel: "Toggle Filter",
      keywords: ["検索", "絞り込み", "filter"],
      group: "page",
      icon: Filter,
      when: ({ viewPage }) => isPageFilterable(viewPage.type),
      run: toggleFilter,
    },
    { beforeCommandId: "page.toggle-write-panel" },
  );
  for (const command of THREAD_FILTER_MODE_COMMANDS) {
    api.addCommand(command, { beforeCommandId: "layout.toggle-zen-mode" });
  }
}
