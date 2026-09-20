import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { platform } from "src/app/platform";
import {
  createDetachedWindowRoot,
  type DetachedWindowHandle,
  type DetachedWindowOptions,
} from "src/view/browser/hooks/detached-window-root";

export type {
  DetachedWindowHandle,
  DetachedWindowOptions,
} from "src/view/browser/hooks/detached-window-root";

interface ManagedDetachedWindowHandle extends DetachedWindowHandle {
  onBeforeUnload: () => void;
}

export interface DetachedWindowState {
  root: HTMLElement | null;
  isOpen: boolean;
  open: (sourceWindow?: Window) => boolean;
  close: () => void;
}

/**
 * 別窓を開き、Reactを接続するrootだけを準備する。
 *
 * 変更理由: 書き込み窓とタブ別窓で同じCSS移送・root生成を使い回し、
 * 別窓の種類ごとにWindowProxyの扱いが分裂しないようにする。
 */
export function openDetachedWindow(
  options: DetachedWindowOptions,
  sourceWindow?: Window,
): DetachedWindowHandle | null {
  const opener = sourceWindow ?? (typeof window === "undefined" ? null : window);
  if (!opener) {
    return null;
  }

  let detachedWindow: Window | null = null;
  try {
    detachedWindow = sourceWindow
      ? (platform.window.openPopup?.(options.name, options.features, sourceWindow) ?? null)
      : (platform.window.openPopup?.(options.name, options.features) ?? null);
  } catch (error) {
    console.error(`[${options.logLabel}] 別窓の生成に失敗しました`, error);
    return null;
  }
  if (!detachedWindow) {
    console.error(`[${options.logLabel}] 別窓を開けませんでした`);
    return null;
  }

  try {
    return {
      window: detachedWindow,
      root: createDetachedWindowRoot(opener.document, detachedWindow, options),
    };
  } catch (error) {
    console.error(`[${options.logLabel}] 別窓の表示基盤を作成できませんでした`, error);
    try {
      if (!detachedWindow.closed) {
        detachedWindow.close();
      }
    } catch (closeError) {
      // root作成失敗時にWindowProxyへ触れない環境でも、本窓へ例外を伝播させない。
      console.error(`[${options.logLabel}] 失敗した別窓を閉じられませんでした`, closeError);
    }
    return null;
  }
}

/**
 * アプリ内の表示を名前付き別窓へ移すためのライフサイクルだけを管理する。
 *
 * 変更理由: 別窓の生成・CSS移送・終了監視を各ページへ持たせると、スレ・スレ一覧・
 * 書き込みで挙動がずれるため、表示するReactツリーから独立した境界にまとめる。
 */
export function useDetachedWindow(options: DetachedWindowOptions): DetachedWindowState {
  const handleRef = useRef<ManagedDetachedWindowHandle | null>(null);
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

  const open = useCallback(
    (sourceWindow?: Window) => {
      const existing = handleRef.current;
      if (existing && !existing.window.closed) {
        existing.window.focus();
        return true;
      }

      const opener = sourceWindow ?? (typeof window === "undefined" ? null : window);
      if (!opener) {
        return false;
      }

      const opened = sourceWindow
        ? openDetachedWindow(options, sourceWindow)
        : openDetachedWindow(options);
      if (!opened) {
        return false;
      }

      const { window: detachedWindow, root: detachedRoot } = opened;
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
      return true;
    },
    [options],
  );

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
