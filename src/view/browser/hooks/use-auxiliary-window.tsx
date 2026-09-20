import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { platform } from "src/app/platform";
import {
  type AuxiliaryWindowHandle,
  type AuxiliaryWindowOptions,
  createAuxiliaryWindowRoot,
} from "src/view/browser/hooks/auxiliary-window-root";

export type {
  AuxiliaryWindowHandle,
  AuxiliaryWindowOptions,
} from "src/view/browser/hooks/auxiliary-window-root";

interface ManagedAuxiliaryWindowHandle extends AuxiliaryWindowHandle {
  onBeforeUnload: () => void;
}

export interface AuxiliaryWindowState {
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
export function openAuxiliaryWindow(
  options: AuxiliaryWindowOptions,
  sourceWindow?: Window,
): AuxiliaryWindowHandle | null {
  const opener = sourceWindow ?? (typeof window === "undefined" ? null : window);
  if (!opener) {
    return null;
  }

  let auxiliaryWindow: Window | null = null;
  try {
    auxiliaryWindow = sourceWindow
      ? (platform.window.openPopup?.(options.name, options.features, sourceWindow) ?? null)
      : (platform.window.openPopup?.(options.name, options.features) ?? null);
  } catch (error) {
    console.error(`[${options.logLabel}] 別窓の生成に失敗しました`, error);
    return null;
  }
  if (!auxiliaryWindow) {
    console.error(`[${options.logLabel}] 別窓を開けませんでした`);
    return null;
  }

  try {
    return {
      window: auxiliaryWindow,
      root: createAuxiliaryWindowRoot(opener.document, auxiliaryWindow, options),
    };
  } catch (error) {
    console.error(`[${options.logLabel}] 別窓の表示基盤を作成できませんでした`, error);
    try {
      if (!auxiliaryWindow.closed) {
        auxiliaryWindow.close();
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
export function useAuxiliaryWindow(options: AuxiliaryWindowOptions): AuxiliaryWindowState {
  const handleRef = useRef<ManagedAuxiliaryWindowHandle | null>(null);
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
        ? openAuxiliaryWindow(options, sourceWindow)
        : openAuxiliaryWindow(options);
      if (!opened) {
        return false;
      }

      const { window: auxiliaryWindow, root: auxiliaryRoot } = opened;
      const onBeforeUnload = () => {
        if (handleRef.current?.window !== auxiliaryWindow) {
          return;
        }
        handleRef.current = null;
        setRoot(null);
      };
      auxiliaryWindow.addEventListener("beforeunload", onBeforeUnload, { once: true });
      handleRef.current = { window: auxiliaryWindow, root: auxiliaryRoot, onBeforeUnload };
      setRoot(auxiliaryRoot);
      auxiliaryWindow.focus();
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
