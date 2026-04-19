import { useRef } from "react";
import React from "react";
import { ANCHOR_SELECTOR } from "src/view/browser/utils/constants";
import { getEventTargetElement, parseAnchorDisplayTargets } from "src/view/browser/utils/utils";

interface ResBodyProps {
  messageHtml: string;
  anchorPreviewDepth: number;
  onUrlClick: (url: string, button: 0 | 1) => void;
  onUrlContextMenu: (url: string, e: React.MouseEvent) => void;
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

export const ResBody: React.FC<ResBodyProps> = React.memo(
  ({
    messageHtml,
    anchorPreviewDepth,
    onUrlClick,
    onUrlContextMenu,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
  }) => {
    const hoveredAnchorKeyRef = useRef<string | null>(null);

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
        onClick={(e) => {
          const target = getEventTargetElement(e.target);
          const anchor = target?.closest("a");
          if (!(anchor instanceof HTMLAnchorElement)) return;
          if (anchor.matches(ANCHOR_SELECTOR)) {
            e.preventDefault();
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
          const href = anchor.getAttribute("href") ?? "";
          if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
            return;
          }
          e.preventDefault();
          onUrlClick(href, 0);
        }}
        onAuxClick={(e) => {
          const target = getEventTargetElement(e.target);
          const anchor = target?.closest("a");
          if (!(anchor instanceof HTMLAnchorElement)) return;
          const href = anchor.getAttribute("href") ?? "";
          if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
            return;
          }
          if (e.button !== 1) return;
          e.preventDefault();
          onUrlClick(href, 1);
        }}
        onContextMenu={(e) => {
          const target = getEventTargetElement(e.target);
          const anchor = target?.closest("a");
          if (!(anchor instanceof HTMLAnchorElement)) return;
          if (anchor.matches(ANCHOR_SELECTOR)) return;
          const href = anchor.getAttribute("href") ?? "";
          if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
            return;
          }
          e.preventDefault();
          onUrlContextMenu(href, e);
        }}
      />
    );
  },
);
ResBody.displayName = "ResBody";
