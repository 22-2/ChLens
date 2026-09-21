import { Ban, Bookmark, BookmarkX, Clipboard } from "lucide-react";
import { container } from "src/service-container";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { copyText } from "src/view/browser/utils/clipboard";

export interface ThreadMenuTarget {
  title: string;
  url: string;
}

export interface ThreadContextMenuOptions {
  target: ThreadMenuTarget;
  isBookmarked: boolean;
  onRegisterTitleNg: () => void;
}

/**
 * スレッド関連メニューのコピー項目を共通化する。
 *
 * 変更理由: スレッドタブ・スレ一覧ページ・下部パネルで項目を個別に定義すると、
 * 並び順やラベル、アイコン、コピー形式がずれるため、1つの定義から生成する。
 */
export function createThreadCopyMenuItems({ title, url }: ThreadMenuTarget): ContextMenuItem[] {
  return [
    {
      id: "copy-title",
      label: "スレタイをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () => void copyText(title),
    },
    {
      id: "copy-url",
      label: "URLをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () => void copyText(url),
    },
    {
      id: "copy-title-url",
      label: "スレタイ＆URLをコピー",
      icon: <Clipboard size={14} />,
      onSelect: () => void copyText(`${title}\n${url}`),
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
}: ThreadContextMenuOptions): ContextMenuItem[] {
  return [
    {
      id: "ng-title",
      label: "スレタイをNG登録",
      icon: <Ban size={14} />,
      onSelect: onRegisterTitleNg,
    },
    createThreadBookmarkMenuItem({ target, isBookmarked }),
    ...createThreadCopyMenuItems(target),
  ];
}

export function createThreadBookmarkMenuItem({
  target,
  isBookmarked,
}: Pick<ThreadContextMenuOptions, "target" | "isBookmarked">): ContextMenuItem {
  return {
    id: "bookmark",
    label: isBookmarked ? "ブックマークを削除" : "ブックマークに追加",
    icon: isBookmarked ? <BookmarkX size={14} /> : <Bookmark size={14} />,
    onSelect: () => {
      // 実装側のadd/removeは非同期結果を返すことがあるため、同期例外とrejectを
      // 同じログ経路へ集約し、コンテキストメニューからの未処理Promiseを残さない。
      void (async () => {
        try {
          if (isBookmarked) {
            await Promise.resolve(container.bookmark.remove(target.url));
          } else {
            await Promise.resolve(
              container.bookmark.add({ url: target.url, title: target.title, type: "thread" }),
            );
          }
        } catch (error) {
          console.error("[ThreadMenu] ブックマークの更新に失敗しました", {
            error,
            url: target.url,
          });
        }
      })();
    },
  };
}
