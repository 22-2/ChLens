import type { Dispatch, MouseEvent } from "react";
import { useCallback } from "react";
import { platform } from "src/app/platform/index";
import { getResNumber } from "src/core/URL";
import type { TabAction } from "src/view/browser/hooks/use-tab-store";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import {
  parseInternalBrowserPageStrict,
  resolveAbsoluteUrl,
  RESPECT_DEFAULT_EXTERNAL,
} from "src/view/browser/utils/link-routing";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";
import { copyText } from "src/view/browser/utils/clipboard";
import { toViewerImageUrl } from "src/view/browser/utils/url-media";

interface UseUrlHandlersParams {
  threadUrl: string;
  dispatch: Dispatch<TabAction>;
  openMediaFromUrl: (url: string, resImages?: string[]) => void;
  addPopupContextMenu: (
    clientX: number,
    clientY: number,
    items: ContextMenuItem[],
    parentId?: string,
  ) => string;
}

interface UseUrlHandlersResult {
  handleUrlClick: (
    rawUrl: string,
    resImages?: string[],
    button?: 0 | 1,
    mode?: typeof RESPECT_DEFAULT_EXTERNAL,
  ) => boolean;
  handleUrlContextMenu: (
    rawUrl: string,
    e: MouseEvent,
    parentId?: string,
    mode?: typeof RESPECT_DEFAULT_EXTERNAL,
  ) => boolean;
  openPopupUrlContextMenu: (
    parentId: string,
  ) => (rawUrl: string, e: MouseEvent, mode?: typeof RESPECT_DEFAULT_EXTERNAL) => void;
}

export function useUrlHandlers({
  threadUrl,
  dispatch,
  openMediaFromUrl,
  addPopupContextMenu,
}: UseUrlHandlersParams): UseUrlHandlersResult {
  const openResolvedUrl = useCallback(
    (
      absoluteUrl: string,
      button: 0 | 1,
      resImages?: string[],
      // 変更理由: クリック経路はホスト互換チェック付きのstrict版を使う。
      // オムニバー入力では parseInternalBrowserPage（広い許容）が使われる。
      internalPage = parseInternalBrowserPageStrict(absoluteUrl),
    ) => {
      // 変更理由: /<board>/ 形式が全ドメインで内部遷移対象になったため、
      // imgur のようにURLが画像として解釈できる場合は button=0 で画像ビューアを優先する。
      // こうすることで「板URL広受け入れ」と「imgur サムネクリック → 画像ビューア」が共存できる。
      if (button === 0 && toViewerImageUrl(absoluteUrl) != null) {
        openMediaFromUrl(absoluteUrl, resImages);
        return;
      }

      if (internalPage) {
        if (internalPage.type === "thread") {
          const jumpResNum = Number.parseInt(getResNumber(absoluteUrl) ?? "", 10);
          if (Number.isFinite(jumpResNum) && jumpResNum > 0) {
            requestThreadResJump(internalPage.threadUrl, jumpResNum);
          }
        }

        // 5ch互換URLは外部ブラウザではなく拡張内で開く。
        // ミドルクリック時はバックグラウンドタブで開く（設定に関わらず常にバックグラウンド）
        if (button === 1) {
          dispatch({
            type: "OPEN_IN_NEW_TAB",
            page: internalPage,
            background: true,
          });
        } else {
          dispatch({ type: "NAVIGATE", page: internalPage });
        }
        return;
      }

      if (button === 1) {
        // ミドルクリック時はバックグラウンドタブで開く
        void platform.window.openTab(absoluteUrl, false);
        return;
      }

      openMediaFromUrl(absoluteUrl, resImages);
    },
    [dispatch, openMediaFromUrl],
  );

  const buildUrlContextMenuItems = useCallback(
    (
      absoluteUrl: string,
      internalPage = parseInternalBrowserPageStrict(absoluteUrl),
    ): ContextMenuItem[] => {
      return [
        {
          id: "open-in-current",
          label: internalPage ? "拡張内で開く" : "開く",
          onSelect: () => openResolvedUrl(absoluteUrl, 0, undefined, internalPage),
        },
        {
          id: "open-in-new-tab",
          label: internalPage ? "拡張内の新しいタブで開く" : "新しいタブで開く",
          onSelect: () => openResolvedUrl(absoluteUrl, 1, undefined, internalPage),
        },
        { id: "sep-url-1", separator: true },
        {
          id: "copy-url",
          label: "URLをコピー",
          onSelect: () => {
            void copyText(absoluteUrl);
          },
        },
        {
          id: "open-in-browser",
          label: "ブラウザで開く",
          onSelect: () => {
            window.open(absoluteUrl, "_blank", "noopener,noreferrer");
          },
        },
      ];
    },
    [openResolvedUrl],
  );

  const handleUrlClick = useCallback(
    (
      rawUrl: string,
      resImages?: string[],
      button: 0 | 1 = 0,
      mode?: typeof RESPECT_DEFAULT_EXTERNAL,
    ) => {
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, threadUrl);
      const internalPage = parseInternalBrowserPageStrict(absoluteUrl);
      if (mode === RESPECT_DEFAULT_EXTERNAL) {
        if (!internalPage) return false;
      }
      openResolvedUrl(absoluteUrl, button, resImages, internalPage);
      return true;
    },
    [openResolvedUrl, threadUrl],
  );

  const handleUrlContextMenu = useCallback(
    (rawUrl: string, e: MouseEvent, parentId?: string, mode?: typeof RESPECT_DEFAULT_EXTERNAL) => {
      const absoluteUrl = resolveAbsoluteUrl(rawUrl, threadUrl);
      const internalPage = parseInternalBrowserPageStrict(absoluteUrl);
      if (mode === RESPECT_DEFAULT_EXTERNAL) {
        // 非5ch互換URLはネイティブの右クリックメニューを優先する。
        if (!internalPage) return false;
      }
      addPopupContextMenu(
        e.clientX,
        e.clientY,
        buildUrlContextMenuItems(absoluteUrl, internalPage),
        parentId,
      );
      return true;
    },
    [addPopupContextMenu, buildUrlContextMenuItems, threadUrl],
  );

  const openPopupUrlContextMenu = useCallback(
    (parentId: string) =>
      (rawUrl: string, e: MouseEvent, mode?: typeof RESPECT_DEFAULT_EXTERNAL) => {
        handleUrlContextMenu(rawUrl, e, parentId, mode);
      },
    [handleUrlContextMenu],
  );

  return { handleUrlClick, handleUrlContextMenu, openPopupUrlContextMenu };
}
