import { useRef } from "node_modules/@types/react";
import React from "react";
import { ANCHOR_SELECTOR } from "src/view/browser/pages/constants";
import { getEventTargetElement, parseAnchorDisplayTargets } from "src/view/browser/pages/utils";

interface ResBodyProps {
  messageHtml: string;
  anchorPreviewDepth: number;
  onUrlClick: (url: string) => void;
  onAnchorClick: (resNum: number) => void;
  onAnchorHover: (
    targets: number[],
    anchorRect: DOMRect,
    label: string,
    depth: number,
  ) => void;
  onAnchorLeave: (fromDepth: number) => void;
}

export const ResBody: React.FC<ResBodyProps> = React.memo(
  ({
    messageHtml,
    anchorPreviewDepth,
    onUrlClick,
    onAnchorClick,
    onAnchorHover,
    onAnchorLeave,
  }) => {
    const hoveredAnchorRef = useRef<HTMLAnchorElement | null>(null);

    return (
      <div
        className="res__body"
        dangerouslySetInnerHTML={{ __html: messageHtml }}
        onMouseOver={(e) => {
          const target = getEventTargetElement(e.target);
          const anchor = target?.closest(ANCHOR_SELECTOR);
          if (!(anchor instanceof HTMLAnchorElement)) {
            if (hoveredAnchorRef.current) {
              hoveredAnchorRef.current = null;
              onAnchorLeave(anchorPreviewDepth);
            }
            return;
          }
          if (hoveredAnchorRef.current === anchor) {
            return;
          }
          hoveredAnchorRef.current = anchor;
          const label = anchor.textContent?.trim() ?? "";
          const targets = parseAnchorDisplayTargets(label);
          if (targets.length === 0) {
            hoveredAnchorRef.current = null;
            onAnchorLeave(anchorPreviewDepth);
            return;
          }
          // 同じアンカー上の細かなマウス移動では再配置せず、プレビューを安定表示させる。
          onAnchorHover(
            targets,
            anchor.getBoundingClientRect(),
            label,
            anchorPreviewDepth,
          );
        }}
        onMouseLeave={() => {
          hoveredAnchorRef.current = null;
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
          onUrlClick(href);
        }}
      />
    );
  },
);
ResBody.displayName = "ResBody";
