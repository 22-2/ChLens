import { useRef } from "react";
import React from "react";
import {
  ANCHOR_SELECTOR,
  ID_LINK_SELECTOR,
} from "src/view/browser/utils/constants";
import {
  getEventTargetElement,
  normalizeIdLinkText,
  parseAnchorDisplayTargets,
} from "src/view/browser/utils/utils";

interface ResBodyProps {
  messageHtml: string;
  anchorPreviewDepth: number;
  onUrlClick: (url: string, button: 0 | 1) => void;
  onUrlContextMenu: (url: string, e: React.MouseEvent) => void;
  onMiddleClickStart?: () => void;
  onIdLinkClick: (id: string, e: React.MouseEvent) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
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

export const ResBody: React.FC<ResBodyProps> = React.memo(
  ({
    messageHtml,
    anchorPreviewDepth,
    onUrlClick,
    onUrlContextMenu,
    onMiddleClickStart,
    onIdLinkClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
  }) => {
    const hoveredAnchorKeyRef = useRef<string | null>(null);
    const handledMiddleClickHrefRef = useRef<string | null>(null);

    return (
      <div
        className="res__body"
        dangerouslySetInnerHTML={{ __html: messageHtml }}
        onMouseOver={(e) => {
          const target = getEventTargetElement(e.target);
          const anchor = target?.closest(ANCHOR_SELECTOR);
          if (!(anchor instanceof HTMLAnchorElement)) {
            if (hoveredAnchorKeyRef.current) {
              hoveredAnchorKeyRef.current = null;
              onAnchorLeave(anchorPreviewDepth);
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
            hoveredAnchorKeyRef.current = null;
            onAnchorLeave(anchorPreviewDepth);
            return;
          }
          hoveredAnchorKeyRef.current = anchorHoverKey;
          // 同じアンカー上の細かなマウス移動では再配置せず、プレビューを安定表示させる。
          onAnchorHover(
            targets,
            anchor.getBoundingClientRect(),
            label,
            anchorPreviewDepth,
          );
        }}
        onMouseLeave={() => {
          hoveredAnchorKeyRef.current = null;
          onAnchorLeave(anchorPreviewDepth);
        }}
        onMouseDown={(e) => {
          if (e.button !== 1) {
            return;
          }
          const anchor = getAnchorElement(e.target);
          if (!anchor) {
            return;
          }
          onMiddleClickStart?.();
          if (anchor.matches(ANCHOR_SELECTOR) || anchor.matches(ID_LINK_SELECTOR)) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (!getNavigableHref(anchor)) {
            return;
          }
          // popup 内リンクの中クリックでは default の中ボタン挙動を止めて自前遷移に寄せる。
          // さらに auxclick が飛ばない環境でも確実に新規タブ動作させるため、
          // middle down 時点で onUrlClick(,1) を実行しておく。
          e.preventDefault();
          e.stopPropagation();
          const href = getNavigableHref(anchor);
          if (!href) {
            return;
          }
          handledMiddleClickHrefRef.current = href;
          onUrlClick(href, 1);
        }}
        onClick={(e) => {
          const anchor = getAnchorElement(e.target);
          if (!anchor) return;
          if (anchor.matches(ID_LINK_SELECTOR)) {
            e.preventDefault();
            e.stopPropagation();
            onIdLinkClick(normalizeIdLinkText(anchor.textContent ?? ""), e);
            return;
          }
          if (anchor.matches(ANCHOR_SELECTOR)) {
            e.preventDefault();
            e.stopPropagation();
            if (anchor.classList.contains("disabled")) {
              return;
            }
            const label = anchor.textContent?.trim() ?? "";
            const targets = parseAnchorDisplayTargets(label);
            if (targets.length > 0) {
              onAnchorClick(targets[0]);
            }
            return;
          }
          const href = getNavigableHref(anchor);
          if (!href) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          onUrlClick(href, 0);
        }}
        onAuxClick={(e) => {
          const anchor = getAnchorElement(e.target);
          if (!anchor) return;
          if (e.button === 1) {
            onMiddleClickStart?.();
          }
          if (anchor.matches(ID_LINK_SELECTOR)) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          const href = getNavigableHref(anchor);
          if (!href) {
            return;
          }
          if (e.button !== 1) return;
          e.preventDefault();
          e.stopPropagation();
          if (handledMiddleClickHrefRef.current === href) {
            handledMiddleClickHrefRef.current = null;
            return;
          }
          onUrlClick(href, 1);
        }}
        onContextMenu={(e) => {
          const anchor = getAnchorElement(e.target);
          if (!anchor) return;
          if (anchor.matches(ANCHOR_SELECTOR) || anchor.matches(ID_LINK_SELECTOR)) return;
          const href = getNavigableHref(anchor);
          if (!href) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          onUrlContextMenu(href, e);
        }}
      />
    );
  },
);
ResBody.displayName = "ResBody";
