import { AppWindow, CopyPlus, ExternalLink, Link, ShieldOff } from "lucide-react";
import { type MouseEvent, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { createLogger } from "src/app/logger";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { copyText } from "src/view/browser/utils/clipboard";
import { getEventTargetElement } from "src/view/browser/utils/dom";
import { requestExternalLink } from "src/view/browser/utils/external-link";
import { analyzeExternalLink } from "src/view/browser/utils/external-link-analysis";

const logger = createLogger("url");

export function useExternalLinkMenu() {
  const surface = useViewSurface();
  const toast = useToast();
  const [state, setState] = useState<{
    url: string;
    x: number;
    y: number;
    trigger: HTMLElement;
    additionalItems: ContextMenuItem[];
  } | null>(null);
  const openMenu = useCallback(
    (url: string, event: MouseEvent<HTMLElement>, additionalItems: ContextMenuItem[] = []) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const trigger =
        getEventTargetElement(event.target, surface.window)?.closest<HTMLElement>("button, a") ??
        event.currentTarget;
      setState({
        url,
        x: event.clientX || rect.left,
        y: event.clientY || rect.bottom,
        trigger,
        additionalItems,
      });
    },
    [surface.window],
  );
  const copy = (url: string) => {
    void copyText(url, surface).catch((error: unknown) => {
      logger.error("リンクのコピーに失敗しました", error);
      toast.error("リンクのコピーに失敗しました");
    });
  };
  let menu = null;
  if (state) {
    const open = (active: boolean, newWindow = false) =>
      requestExternalLink(state.url, {
        sourceWindow: surface.window,
        active,
        newWindow,
        returnFocus: state.trigger,
      });
    const cleanedUrl = analyzeExternalLink(state.url).cleanedUrl;
    const items: ContextMenuItem[] = [
      {
        id: "open",
        label: "開く",
        icon: <ExternalLink size={14} />,
        onSelect: () => open(true),
      },
      {
        id: "open-background",
        label: "新しいタブで開く",
        icon: <CopyPlus size={14} />,
        onSelect: () => open(false),
      },
      {
        id: "open-window",
        label: "新しいウィンドウで開く",
        icon: <AppWindow size={14} />,
        onSelect: () => open(true, true),
      },
      { id: "separator", separator: true },
      {
        id: "copy",
        label: "URLをコピー",
        icon: <Link size={14} />,
        onSelect: () => copy(state.url),
      },
      {
        id: "copy-clean",
        label: "追跡情報を除いてURLをコピー",
        icon: <ShieldOff size={14} />,
        disabled: !cleanedUrl,
        onSelect: () => {
          if (cleanedUrl) copy(cleanedUrl);
        },
      },
      ...(state.additionalItems.length > 0
        ? [{ id: "additional-separator", separator: true }, ...state.additionalItems]
        : []),
    ];
    // 仮想レスのtransformによる座標系・重なり順から切り離し、別窓でも操作元へ表示する。
    menu = createPortal(
      <ContextMenu
        enableKeyboardNavigation
        zIndex="calc(var(--sys-z-media-viewer) + var(--sys-z-local-raised))"
        x={state.x}
        y={state.y}
        items={items}
        onClose={() => setState(null)}
      />,
      surface.document.body,
    );
  }
  return { openMenu, menu };
}
