import {
  Bookmark,
  File,
  History,
  House,
  LayoutList,
  ListTree,
  type LucideProps,
  MessageSquareText,
  PenLine,
  ScrollText,
  Settings,
} from "lucide-react";
import React from "react";
import type { PageType } from "src/view/browser/types";

// 変更理由: 垂直タブバーの簡易表示ではタイトルを隠すため、ページ種別を見分ける
// アイコンが必須になる。対応表をここに集約し、将来の展開表示側の導入時も使い回す。
// 板ツリーを削除しても板を探す目印を保つため、ListTreeを板一覧へ引き継ぐ。
const PAGE_TYPE_ICONS = {
  home: House,
  // 旧セッションでのみ残る空タブの種別も描画できるようにする。
  newTab: File,
  boardList: ListTree,
  threadList: LayoutList,
  thread: MessageSquareText,
  settings: Settings,
  bookmarkList: Bookmark,
  historyList: History,
  writeHistoryList: PenLine,
  logList: ScrollText,
} as const satisfies Record<PageType, React.ComponentType<LucideProps>>;

export const PageTypeIcon: React.FC<{ type: PageType; size?: number }> = ({ type, size = 15 }) => {
  const Icon = PAGE_TYPE_ICONS[type];
  return <Icon size={size} aria-hidden="true" />;
};
