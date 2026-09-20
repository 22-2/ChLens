import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { platform } from "src/app/platform";

export interface DetachedWindowOptions {
  name: string;
  features: string;
  title: string;
  shellClassName: string;
  logLabel: string;
}

interface DetachedWindowHandle {
  window: Window;
  root: HTMLElement;
  onBeforeUnload: () => void;
}

export interface DetachedWindowState {
  root: HTMLElement | null;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

function copyStyles(sourceDocument: Document, targetDocument: Document): void {
  // 変更理由: PortalはDOMだけを別Documentへ移すため、表示側のスタイルも同時に複製して
  // 将来ほかのページを別窓へ移しても、呼び出し側がCSSの移送方法を意識しないようにする。
  for (const style of sourceDocument.querySelectorAll<HTMLStyleElement>("style")) {
    targetDocument.head.appendChild(style.cloneNode(true));
  }
  for (const stylesheet of sourceDocument.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]',
  )) {
    targetDocument.head.appendChild(stylesheet.cloneNode(true));
  }
}

function createWindowRoot(
  sourceDocument: Document,
  targetWindow: Window,
  options: DetachedWindowOptions,
): HTMLElement {
  const sourceShell = sourceDocument.querySelector<HTMLElement>(".browser-shell");
  const targetDocument = targetWindow.document;
  targetDocument.head.innerHTML = "";
  targetDocument.title = options.title;
  targetDocument.head.appendChild(
    Object.assign(targetDocument.createElement("meta"), {
      charSet: "utf-8",
    }),
  );
  copyStyles(sourceDocument, targetDocument);

  targetDocument.body.innerHTML = "";
  targetDocument.body.style.margin = "0";
  targetDocument.body.style.overflow = "hidden";
  const root = targetDocument.createElement("div");
  root.className = `browser-shell ${options.shellClassName}`;
  root.dataset.theme = sourceShell?.dataset.theme ?? "light";
  targetDocument.body.appendChild(root);
  return root;
}

/**
 * アプリ内の表示を名前付き別窓へ移すためのライフサイクルだけを管理する。
 *
 * 変更理由: 別窓の生成・CSS移送・終了監視を各ページへ持たせると、スレ・スレ一覧・
 * 書き込みで挙動がずれるため、表示するReactツリーから独立した境界にまとめる。
 */
export function useDetachedWindow(options: DetachedWindowOptions): DetachedWindowState {
  const handleRef = useRef<DetachedWindowHandle | null>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  const close = useCallback(() => {
    const handle = handleRef.current;
    handleRef.current = null;
    setRoot(null);
    if (!handle) {
      return;
    }

    handle.window.removeEventListener("beforeunload", handle.onBeforeUnload);
    if (!handle.window.closed) {
      handle.window.close();
    }
  }, []);

  const open = useCallback(() => {
    const existing = handleRef.current;
    if (existing && !existing.window.closed) {
      existing.window.focus();
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const detachedWindow = platform.window.openPopup?.(options.name, options.features) ?? null;
    if (!detachedWindow) {
      console.error(`[${options.logLabel}] 別窓を開けませんでした`);
      return;
    }

    const detachedRoot = createWindowRoot(document, detachedWindow, options);
    const onBeforeUnload = () => {
      if (handleRef.current?.window !== detachedWindow) {
        return;
      }
      handleRef.current = null;
      setRoot(null);
    };
    detachedWindow.addEventListener("beforeunload", onBeforeUnload, { once: true });
    handleRef.current = { window: detachedWindow, root: detachedRoot, onBeforeUnload };
    setRoot(detachedRoot);
    detachedWindow.focus();
  }, [options]);

  useEffect(() => {
    return () => {
      const handle = handleRef.current;
      handleRef.current = null;
      handle?.window.removeEventListener("beforeunload", handle.onBeforeUnload);
      if (handle && !handle.window.closed) {
        handle.window.close();
      }
    };
  }, []);

  return useMemo(
    () => ({
      root,
      isOpen: root !== null,
      open,
      close,
    }),
    [close, open, root],
  );
}
