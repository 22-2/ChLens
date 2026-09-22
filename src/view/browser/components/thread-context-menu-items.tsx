import { Ban, Bookmark, BookmarkX, Clipboard } from "lucide-react";
import {
  COMMAND_REQUEST_IDS,
  type CommandRequest,
  type CommandTarget,
} from "src/view/browser/commands/command-runtime";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";

export interface ThreadMenuTarget {
  title: string;
  url: string;
}

export interface ThreadContextMenuOptions {
  target: ThreadMenuTarget;
  isBookmarked: boolean;
  onRegisterTitleNg: () => void;
  runCommand: (request: CommandRequest) => void;
}

function toThreadCommandTarget(target: ThreadMenuTarget): CommandTarget {
  return { ...target, kind: "thread" };
}

/**
 * スレッド関連メニューのコピー項目を共通化する。
 *
 * 変更理由: スレッドタブ・スレ一覧ページ・下部パネルで項目を個別に定義すると、
 * 並び順やラベル、アイコン、コピー形式がずれるため、1つの定義から生成する。
 */
export function createThreadCopyMenuItems(
  target: ThreadMenuTarget,
  runCommand: (request: CommandRequest) => void,
): ContextMenuItem[] {
  const commandTarget = toThreadCommandTarget(target);
  return [
    {
      id: "copy-title",
      label: "スレタイをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () =>
        runCommand({
          id: COMMAND_REQUEST_IDS.TARGET_COPY,
          args: { target: commandTarget, format: "title" },
        }),
    },
    {
      id: "copy-url",
      label: "URLをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () =>
        runCommand({
          id: COMMAND_REQUEST_IDS.TARGET_COPY,
          args: { target: commandTarget, format: "url" },
        }),
    },
    {
      id: "copy-title-url",
      label: "スレタイ＆URLをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () =>
        runCommand({
          id: COMMAND_REQUEST_IDS.TARGET_COPY,
          args: { target: commandTarget, format: "title-url" },
        }),
    },
  ];
}

/**
 * スレ一覧の行メニューで共通するNG・ブックマーク・コピー項目を生成する。
 *
 * 変更理由: 一覧ページと下部パネルが同じ操作を別々に組み立てると、項目の順序や
 * ブックマーク更新時の失敗処理がずれるため、共有の操作境界へ集約する。
 */
export function createThreadContextMenuItems({
  target,
  isBookmarked,
  onRegisterTitleNg,
  runCommand,
}: ThreadContextMenuOptions): ContextMenuItem[] {
  return [
    {
      id: "ng-title",
      label: "スレタイをNG登録",
      icon: <Ban size={14} />,
      onSelect: onRegisterTitleNg,
    },
    createThreadBookmarkMenuItem({ target, isBookmarked, runCommand }),
    ...createThreadCopyMenuItems(target, runCommand),
  ];
}

export function createThreadBookmarkMenuItem({
  target,
  isBookmarked,
  runCommand,
}: Pick<ThreadContextMenuOptions, "target" | "isBookmarked" | "runCommand">): ContextMenuItem {
  const commandTarget = toThreadCommandTarget(target);
  return {
    id: "bookmark",
    label: isBookmarked ? "ブックマークを削除" : "ブックマークに追加",
    icon: isBookmarked ? <BookmarkX size={14} /> : <Bookmark size={14} />,
    onSelect: () => {
      runCommand({
        id: COMMAND_REQUEST_IDS.TARGET_BOOKMARK_SET,
        args: {
          target: commandTarget,
          bookmarked: !isBookmarked,
        },
      });
    },
  };
}
