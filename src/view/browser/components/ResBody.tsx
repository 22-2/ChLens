import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { ANCHOR_SELECTOR, ID_LINK_SELECTOR } from "src/view/browser/utils/constants";
import {
  RESPECT_DEFAULT_EXTERNAL,
  type ResBodyUrlClickHandler,
  type UrlContextMenuHandler,
} from "src/view/browser/utils/link-routing";
import { highlightSearchMatches } from "src/view/browser/utils/search-highlight";
import {
  getEventTargetElement,
  normalizeIdLinkText,
  parseAnchorDisplayTargets,
} from "src/view/browser/utils/utils";

const PRIMARY_MOUSE_BUTTON = 0 as const;
const MIDDLE_MOUSE_BUTTON = 1 as const;

type EventConsumer = Pick<React.SyntheticEvent, "preventDefault" | "stopPropagation">;

type ResBodyInteractionHandlers = Pick<
  React.HTMLAttributes<HTMLDivElement>,
  "onMouseOver" | "onMouseLeave" | "onMouseDown" | "onClick" | "onAuxClick" | "onContextMenu"
>;

interface MiddleClickState {
  href: string | null;
  handled: boolean;
}

interface ResBodyProps {
  messageHtml: string;
  searchQuery?: string;
  anchorPreviewDepth: number;
  onUrlClick: ResBodyUrlClickHandler;
  onUrlContextMenu: UrlContextMenuHandler;
  onMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (targets: number[], anchorRect: DOMRect, label: string, depth: number) => void;
  onAnchorLeave: (fromDepth: number) => void;
  ngResNums?: ReadonlySet<number>;
}

function getAnchorHoverKey(anchor: HTMLAnchorElement): string {
  const label = anchor.textContent?.trim() ?? "";
  const rect = anchor.getBoundingClientRect();
  // hover中に親が再描画されると同じアンカーでもDOMノードが差し替わることがあるため、
  // ノード同一性ではなく表示位置込みの論理キーで同一hoverを判定する。
  return `${label}:${Math.round(rect.left)}:${Math.round(rect.top)}`;
}

function getAnchorElement(target: EventTarget | null): HTMLAnchorElement | null {
  const element = getEventTargetElement(target);
  const anchor = element?.closest("a");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function getNavigableHref(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href") ?? "";
  if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
    return null;
  }
  return href;
}

function stopEvent(event: EventConsumer): void {
  event.preventDefault();
  event.stopPropagation();
}

function isReplyAnchor(anchor: HTMLAnchorElement): boolean {
  return anchor.matches(ANCHOR_SELECTOR);
}

function isIdAnchor(anchor: HTMLAnchorElement): boolean {
  return anchor.matches(ID_LINK_SELECTOR);
}

function isManagedAnchor(anchor: HTMLAnchorElement): boolean {
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
): boolean {
  return onUrlClick(href, button, RESPECT_DEFAULT_EXTERNAL) === true;
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
}: Omit<ResBodyProps, "messageHtml" | "ngResNums">): ResBodyInteractionHandlers {
  const hoveredAnchorKeyRef = useRef<string | null>(null);
  const middleClickStateRef = useRef<MiddleClickState>({
    href: null,
    handled: false,
  });
  const suppressNextAnchorLeaveRef = useRef(false);

  // React view では本文リンクの右クリックを URL 種別に関係なく既定メニューへ委譲する。
  // handler 型は共有しているため prop は受けるが、この hook では敢えて使わない。
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
      const target = getEventTargetElement(e.target);
      const anchor = target?.closest(ANCHOR_SELECTOR);
      if (!(anchor instanceof HTMLAnchorElement)) {
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
    [anchorPreviewDepth, clearHoveredAnchor, notifyAnchorLeave, onAnchorHover],
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

      const anchor = getAnchorElement(e.target);
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

      const handled = shouldHandleUrlClick(onUrlClick, href, MIDDLE_MOUSE_BUTTON);
      rememberMiddleClick(middleClickStateRef, href, handled);

      if (handled) {
        stopEvent(e);
      }
    },
    [onMiddleClickStart, onUrlClick],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = getAnchorElement(e.target);
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

      if (shouldHandleUrlClick(onUrlClick, href, PRIMARY_MOUSE_BUTTON)) {
        stopEvent(e);
      }
    },
    [onAnchorClick, onIdLinkClick, onUrlClick],
  );

  const handleAuxClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = getAnchorElement(e.target);
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

      if (shouldHandleUrlClick(onUrlClick, href, MIDDLE_MOUSE_BUTTON)) {
        stopEvent(e);
      }
    },
    [onMiddleClickStart, onUrlClick],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = getAnchorElement(e.target);
    if (!anchor || isManagedAnchor(anchor)) {
      return;
    }

    if (!getNavigableHref(anchor)) {
      return;
    }

    // 画像/リンクの右クリックは拡張内リンクでもネイティブメニューを優先する。
  }, []);

  return {
    onMouseOver: handleMouseOver,
    onMouseLeave: handleMouseLeave,
    onMouseDown: handleMouseDown,
    onClick: handleClick,
    onAuxClick: handleAuxClick,
    onContextMenu: handleContextMenu,
  };
}

export const ResBody: React.FC<ResBodyProps> = React.memo(
  ({
    messageHtml,
    searchQuery = "",
    anchorPreviewDepth,
    onUrlClick,
    onUrlContextMenu,
    onMiddleClickStart,
    onIdLinkClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
    ngResNums,
  }) => {
    const interactionHandlers = useResBodyInteractionHandlers({
      anchorPreviewDepth,
      onUrlClick,
      onUrlContextMenu,
      onMiddleClickStart,
      onIdLinkClick,
      onAnchorClick,
      onAnchorHover,
      onAnchorLeave,
    });
    const bodyRef = useRef<HTMLDivElement>(null);
    const highlightedMessageHtml = useMemo(
      () => highlightSearchMatches(messageHtml, searchQuery),
      [messageHtml, searchQuery],
    );

    useLayoutEffect(() => {
      const body = bodyRef.current;
      if (!body) return;
      for (const anchor of body.querySelectorAll<HTMLAnchorElement>(ANCHOR_SELECTOR)) {
        const targets = parseAnchorDisplayTargets(anchor.textContent?.trim() ?? "");
        anchor.classList.toggle(
          "anchor--ng-target",
          targets.some((target) => ngResNums?.has(target) ?? false),
        );
      }
    }, [highlightedMessageHtml, ngResNums]);

    return (
      <div
        ref={bodyRef}
        className="res__body"
        dangerouslySetInnerHTML={{ __html: highlightedMessageHtml }}
        {...interactionHandlers}
      />
    );
  },
);
ResBody.displayName = "ResBody";
