import React, { useCallback, useMemo, useRef } from "react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useExternalLinkMenu } from "src/view/browser/hooks/use-external-link-menu";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ThreadSearchTarget } from "src/view/browser/types";
import { hasMissingAnchorTarget, parseAnchorDisplayTargets } from "src/view/browser/utils/anchor";
import { ANCHOR_SELECTOR, ID_LINK_SELECTOR } from "src/view/browser/utils/constants";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import { requestExternalLink } from "src/view/browser/utils/external-link";
import { EXTERNAL_LINK_CONFIRM_CONFIG_KEY } from "src/view/browser/utils/external-link-analysis";
import { parseInternalBrowserPageStrict } from "src/view/browser/utils/link-routing";
import {
  type ResBodyUrlClickHandler,
  RESPECT_DEFAULT_EXTERNAL,
  type UrlContextMenuHandler,
} from "src/view/browser/utils/link-routing";
import { normalizeIdLinkText } from "src/view/browser/utils/response-format";
import { highlightSearchMatches } from "src/view/browser/utils/search-highlight";

const PRIMARY_MOUSE_BUTTON = 0 as const;
const MIDDLE_MOUSE_BUTTON = 1 as const;

type EventConsumer = Pick<React.SyntheticEvent, "preventDefault" | "stopPropagation">;

type ResBodyInteractionHandlers = Pick<
  React.HTMLAttributes<HTMLDivElement>,
  | "onMouseOver"
  | "onMouseLeave"
  | "onMouseDown"
  | "onClick"
  | "onAuxClick"
  | "onContextMenu"
  | "onKeyDown"
>;

interface MiddleClickState {
  href: string | null;
  handled: boolean;
}

interface ResBodyProps {
  messageHtml: string;
  searchQuery?: string;
  searchTarget?: ThreadSearchTarget;
  /** ページ内検索（Ctrl+F）の検索語と、本文の中で現在の一致が何番目か（なければ -1）。 */
  findQuery?: string;
  findActiveOccurrence?: number;
  anchorPreviewDepth: number;
  onUrlClick: ResBodyUrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  ngResNums?: ReadonlySet<number>;
  /** 現在表示できるレスを共有し、本文とポップアップで欠損判定を揃える。 */
  resMap?: ReadonlyMap<number, unknown>;
}

function getAnchorHoverKey(anchor: HTMLElement): string {
  const label = anchor.textContent?.trim() ?? "";
  const rect = anchor.getBoundingClientRect();
  // hover中に親が再描画されると同じアンカーでもDOMノードが差し替わることがあるため、
  // ノード同一性ではなく表示位置込みの論理キーで同一hoverを判定する。
  return `${label}:${Math.round(rect.left)}:${Math.round(rect.top)}`;
}

function getAnchorElement(
  target: EventTarget | null,
  targetWindow: Window = globalThis.window,
): HTMLElement | null {
  const element = getEventTargetElement(target, targetWindow);
  const anchor = element?.closest<HTMLElement>("a, button[data-external-url]");
  if (!anchor) {
    return null;
  }

  // 別窓のWindowProxyではHTMLAnchorElementのコンストラクタが取得できないことがある。
  // closest("a")で要素種別は確定しているため、constructor依存で操作を捨てず、
  // イベント元のDocumentに属するアンカーをそのまま扱う。
  return anchor;
}

function getNavigableHref(anchor: HTMLElement): string | null {
  const href = anchor.getAttribute("data-external-url") ?? anchor.getAttribute("href") ?? "";
  if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
    return null;
  }
  return href;
}

function stopEvent(event: EventConsumer): void {
  event.preventDefault();
  event.stopPropagation();
}

function isReplyAnchor(anchor: HTMLElement): boolean {
  return anchor.matches(ANCHOR_SELECTOR);
}

function isIdAnchor(anchor: HTMLElement): boolean {
  return anchor.matches(ID_LINK_SELECTOR);
}

function isManagedAnchor(anchor: HTMLElement): boolean {
  return isReplyAnchor(anchor) || isIdAnchor(anchor);
}

function consumeAnchorLeaveSuppression(
  suppressNextAnchorLeaveRef: React.MutableRefObject<boolean>,
): boolean {
  if (!suppressNextAnchorLeaveRef.current) {
    return false;
  }
  suppressNextAnchorLeaveRef.current = false;
  return true;
}

function armAnchorLeaveSuppression(
  suppressNextAnchorLeaveRef: React.MutableRefObject<boolean>,
): void {
  // middle click で別タブが開く瞬間は mouseleave が先に飛ぶことがあり、
  // その1回だけはアンカープレビュー close を抑止して誤クローズを防ぐ。
  suppressNextAnchorLeaveRef.current = true;
}

function rememberMiddleClick(
  middleClickStateRef: React.MutableRefObject<MiddleClickState>,
  href: string,
  handled: boolean,
): void {
  middleClickStateRef.current = { href, handled };
}

function consumeRememberedMiddleClick(
  middleClickStateRef: React.MutableRefObject<MiddleClickState>,
  href: string,
): MiddleClickState | null {
  if (middleClickStateRef.current.href !== href) {
    return null;
  }

  const remembered = middleClickStateRef.current;
  middleClickStateRef.current = { href: null, handled: false };
  return remembered;
}

function shouldHandleUrlClick(
  onUrlClick: ResBodyUrlClickHandler,
  href: string,
  button: 0 | 1,
  confirmExternal = false,
): boolean {
  return onUrlClick(href, button, confirmExternal ? undefined : RESPECT_DEFAULT_EXTERNAL) === true;
}

function useResBodyInteractionHandlers({
  anchorPreviewDepth,
  onUrlClick,
  onUrlContextMenu,
  onMiddleClickStart,
  onIdLinkClick,
  onAnchorClick,
  onAnchorHover,
  onAnchorLeave,
  viewWindow,
  openExternalMenu,
}: Omit<ResBodyProps, "messageHtml" | "ngResNums"> & {
  viewWindow: Window;
  openExternalMenu: (url: string, event: React.MouseEvent<HTMLElement>) => void;
}): ResBodyInteractionHandlers {
  const hoveredAnchorKeyRef = useRef<string | null>(null);
  const middleClickStateRef = useRef<MiddleClickState>({
    href: null,
    handled: false,
  });
  const suppressNextAnchorLeaveRef = useRef(false);

  // OFF時の既定メニューを維持し、ON時の外部リンクだけを共通の確認メニューへ渡す。
  void onUrlContextMenu;

  const notifyAnchorLeave = useCallback(() => {
    if (consumeAnchorLeaveSuppression(suppressNextAnchorLeaveRef)) {
      return;
    }
    onAnchorLeave(anchorPreviewDepth);
  }, [anchorPreviewDepth, onAnchorLeave]);

  const clearHoveredAnchor = useCallback(() => {
    hoveredAnchorKeyRef.current = null;
  }, []);

  const handleMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = getEventTargetElement(e.target, viewWindow);
      const anchor = getAnchorElement(target, viewWindow);
      if (!anchor || !anchor.matches(ANCHOR_SELECTOR)) {
        if (hoveredAnchorKeyRef.current) {
          clearHoveredAnchor();
          notifyAnchorLeave();
        }
        return;
      }

      const label = anchor.textContent?.trim() ?? "";
      const anchorHoverKey = getAnchorHoverKey(anchor);
      if (hoveredAnchorKeyRef.current === anchorHoverKey) {
        return;
      }

      const targets = parseAnchorDisplayTargets(label);
      if (targets.length === 0) {
        clearHoveredAnchor();
        notifyAnchorLeave();
        return;
      }

      hoveredAnchorKeyRef.current = anchorHoverKey;
      // 同じアンカー上の細かなマウス移動では再配置せず、プレビューを安定表示させる。
      onAnchorHover(targets, anchor.getBoundingClientRect(), label, anchorPreviewDepth);
    },
    [anchorPreviewDepth, clearHoveredAnchor, notifyAnchorLeave, onAnchorHover, viewWindow],
  );

  const handleMouseLeave = useCallback(() => {
    clearHoveredAnchor();
    notifyAnchorLeave();
  }, [clearHoveredAnchor, notifyAnchorLeave]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== MIDDLE_MOUSE_BUTTON) {
        return;
      }

      const anchor = getAnchorElement(e.target, viewWindow);
      if (!anchor) {
        return;
      }

      armAnchorLeaveSuppression(suppressNextAnchorLeaveRef);
      onMiddleClickStart?.();

      if (isManagedAnchor(anchor)) {
        stopEvent(e);
        return;
      }

      const href = getNavigableHref(anchor);
      if (!href) {
        return;
      }

      const handled = shouldHandleUrlClick(
        onUrlClick,
        href,
        MIDDLE_MOUSE_BUTTON,
        anchor.hasAttribute("data-external-url"),
      );
      rememberMiddleClick(middleClickStateRef, href, handled);

      if (handled) {
        stopEvent(e);
      }
    },
    [onMiddleClickStart, onUrlClick, viewWindow],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = getAnchorElement(e.target, viewWindow);
      if (!anchor) {
        return;
      }

      if (isIdAnchor(anchor)) {
        stopEvent(e);
        onIdLinkClick(normalizeIdLinkText(anchor.textContent ?? ""), e);
        return;
      }

      if (isReplyAnchor(anchor)) {
        stopEvent(e);
        if (anchor.classList.contains("disabled")) {
          return;
        }

        const label = anchor.textContent?.trim() ?? "";
        const targets = parseAnchorDisplayTargets(label);
        if (targets.length > 0) {
          // NGレスもスレ内にプレースホルダーとして存在するため、通常レスと同じくジャンプできる。
          onAnchorClick(targets[0]);
        }
        return;
      }

      const href = getNavigableHref(anchor);
      if (!href) {
        return;
      }

      if (anchor.hasAttribute("data-external-url") && (e.ctrlKey || e.metaKey || e.shiftKey)) {
        stopEvent(e);
        requestExternalLink(href, {
          sourceWindow: viewWindow,
          active: !(e.ctrlKey || e.metaKey),
          newWindow: e.shiftKey,
        });
        return;
      }
      if (
        shouldHandleUrlClick(
          onUrlClick,
          href,
          PRIMARY_MOUSE_BUTTON,
          anchor.hasAttribute("data-external-url"),
        )
      ) {
        stopEvent(e);
      }
    },
    [onAnchorClick, onIdLinkClick, onUrlClick, viewWindow],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" || e.repeat) {
        return;
      }

      const anchor = getAnchorElement(e.target, viewWindow);
      if (!anchor || !isManagedAnchor(anchor)) {
        return;
      }

      // hrefなしのリンクも従来のアンカーと同じくEnterで有効化する。
      e.preventDefault();
      anchor.click();
    },
    [viewWindow],
  );

  const handleAuxClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = getAnchorElement(e.target, viewWindow);
      if (!anchor) {
        return;
      }

      if (e.button === MIDDLE_MOUSE_BUTTON) {
        armAnchorLeaveSuppression(suppressNextAnchorLeaveRef);
        onMiddleClickStart?.();
      }

      if (isIdAnchor(anchor)) {
        stopEvent(e);
        return;
      }

      const href = getNavigableHref(anchor);
      if (!href || e.button !== MIDDLE_MOUSE_BUTTON) {
        return;
      }

      const remembered = consumeRememberedMiddleClick(middleClickStateRef, href);
      if (remembered) {
        if (remembered.handled) {
          stopEvent(e);
        }
        return;
      }

      if (
        shouldHandleUrlClick(
          onUrlClick,
          href,
          MIDDLE_MOUSE_BUTTON,
          anchor.hasAttribute("data-external-url"),
        )
      ) {
        stopEvent(e);
      }
    },
    [onMiddleClickStart, onUrlClick, viewWindow],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = getAnchorElement(e.target, viewWindow);
      if (!anchor || isManagedAnchor(anchor)) {
        return;
      }

      const href = getNavigableHref(anchor);
      if (!href) {
        return;
      }

      if (anchor.hasAttribute("data-external-url")) openExternalMenu(href, e);

      // それ以外のリンクは従来どおりネイティブメニューを優先する。
    },
    [openExternalMenu, viewWindow],
  );

  return {
    onMouseOver: handleMouseOver,
    onMouseLeave: handleMouseLeave,
    onMouseDown: handleMouseDown,
    onClick: handleClick,
    onKeyDown: handleKeyDown,
    onAuxClick: handleAuxClick,
    onContextMenu: handleContextMenu,
  };
}

export const ResBody: React.FC<ResBodyProps> = React.memo(
  ({
    messageHtml,
    searchQuery = "",
    searchTarget = "all",
    findQuery = "",
    findActiveOccurrence = -1,
    anchorPreviewDepth,
    onUrlClick,
    onUrlContextMenu,
    onMiddleClickStart,
    onIdLinkClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    ngResNums,
    resMap,
  }) => {
    const { window: viewWindow, document: viewDocument } = useViewSurface();
    const { value: confirmExternal } = useConfigBooleanSetting(EXTERNAL_LINK_CONFIRM_CONFIG_KEY);
    const { menu, openMenu } = useExternalLinkMenu();
    const interactionHandlers = useResBodyInteractionHandlers({
      anchorPreviewDepth,
      onUrlClick,
      onUrlContextMenu,
      onMiddleClickStart,
      onIdLinkClick,
      onAnchorClick,
      onAnchorHover,
      onAnchorLeave,
      viewWindow,
      openExternalMenu: openMenu,
    });
    const highlightedMessageHtml = useMemo(() => {
      const searched =
        searchTarget === "all" || searchTarget === "body"
          ? highlightSearchMatches(messageHtml, searchQuery)
          : messageHtml;
      // ページ内検索の一致は検索フィルタの強調に重ねて付け、どちらの一致も見えるようにする。
      return highlightSearchMatches(searched, findQuery, {
        className: "res__find-match",
        activeIndex: findActiveOccurrence,
        activeClassName: "res__find-match--current",
      });
    }, [findActiveOccurrence, findQuery, messageHtml, searchQuery, searchTarget]);
    const decoratedMessageHtml = useMemo(() => {
      if (!confirmExternal && (ngResNums == null || ngResNums.size === 0) && resMap == null) {
        return highlightedMessageHtml;
      }

      // 変更理由: innerHTMLを描画した後にclassListを変更すると、レス更新時のDOM差し替えと
      // 競合して一瞬だけ通常色へ戻る。描画するHTMLそのものへ状態クラスを含めることで、
      // NG対象・欠損対象のアンカーを常に同じフレームで表示する。
      const template = viewDocument.createElement("template");
      template.innerHTML = highlightedMessageHtml;
      if (confirmExternal) {
        for (const anchor of template.content.querySelectorAll<HTMLAnchorElement>("a[href]")) {
          const href = anchor.getAttribute("href") ?? "";
          if (
            !/^https?:/i.test(href) ||
            isManagedAnchor(anchor) ||
            parseInternalBrowserPageStrict(href)
          )
            continue;
          const button = viewDocument.createElement("button");
          button.type = "button";
          button.className = `${anchor.className} external-link-button`;
          button.setAttribute("data-external-url", href);
          button.title = anchor.title || href;
          button.innerHTML = anchor.innerHTML;
          anchor.replaceWith(button);
        }
      }
      for (const anchor of template.content.querySelectorAll<HTMLAnchorElement>(ANCHOR_SELECTOR)) {
        const targets = parseAnchorDisplayTargets(anchor.textContent?.trim() ?? "");
        // 範囲・複数参照も1つのアンカーとして操作されるため、1件でも欠損なら
        // 表示だけを強調する。クリックとホバーは既存どおり解決可能な番号へ渡す。
        const hasMissingTarget = resMap != null && hasMissingAnchorTarget(targets, resMap);
        anchor.classList.toggle(
          "anchor--ng-target",
          targets.some((target) => ngResNums?.has(target) ?? false),
        );
        anchor.classList.toggle("anchor--missing-target", hasMissingTarget);
      }
      return template.innerHTML;
    }, [confirmExternal, highlightedMessageHtml, ngResNums, resMap, viewDocument]);
    // React 19 は dangerouslySetInnerHTML の object identity が変わると、
    // HTML文字列が同じでも innerHTML を再代入して選択中のText nodeを置換する。
    // 自動更新時の親再描画では同じHTMLを再利用し、ユーザーの選択範囲を保持する。
    const bodyMarkup = useMemo(() => ({ __html: decoratedMessageHtml }), [decoratedMessageHtml]);

    return (
      <>
        <div className="res__body" dangerouslySetInnerHTML={bodyMarkup} {...interactionHandlers} />
        {confirmExternal && menu}
      </>
    );
  },
);
ResBody.displayName = "ResBody";
