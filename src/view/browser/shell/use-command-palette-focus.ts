import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import {
  commandPalette,
  commandPaletteStore,
} from "src/view/browser/commands/command-palette-store";
import type { OmnibarInputMode } from "src/view/browser/hooks/use-omnibar";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";

interface UseCommandPaletteFocusParams {
  isActivePane: boolean;
  isUrlEditing: boolean;
  setIsUrlEditing: (editing: boolean) => void;
  urlInputRef: RefObject<HTMLInputElement | null>;
  activate: (mode: OmnibarInputMode) => void;
  handleBlur: () => void;
  omnibarMode: OmnibarInputMode;
  isOmnibarOpen: boolean;
}

/**
 * コマンドパレットの開閉とオムニバー(タイトルバーのURL入力)の編集開始・フォーカス・ブラー連動をまとめる。
 * パレットの状態を返し、呼び出し側はフォーカスアウト時の判定に使う。
 */
export function useCommandPaletteFocus({
  isActivePane,
  isUrlEditing,
  setIsUrlEditing,
  urlInputRef,
  activate,
  handleBlur,
  omnibarMode,
  isOmnibarOpen,
}: UseCommandPaletteFocusParams) {
  const { window: viewWindow } = useViewSurface();
  const paletteState = useSyncExternalStore(
    commandPaletteStore.subscribe,
    commandPaletteStore.getState,
    commandPaletteStore.getState,
  );
  // 一つの状態を共有しても、入力欄を開くのは操作元の窓だけにする。
  const openedHere = paletteState.opened && paletteState.owner === viewWindow;

  useLayoutEffect(() => {
    if (!isActivePane) {
      return;
    }

    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      // Ctrl/Cmd+LはブラウザのURL入力に任せ、アプリはコマンドパレットのショートカットだけを扱う。
      if (event.shiftKey && key === "p") {
        event.preventDefault();
        // 変更理由: Zen切替直後など、再描画後にeffectが再登録される前のキー入力でも、
        // 古い開閉状態でショートカットを処理しないようイベント時点の状態を読む。
        const currentPaletteState = commandPaletteStore.getState();
        if (
          currentPaletteState.opened &&
          currentPaletteState.owner === viewWindow &&
          currentPaletteState.mode === "command"
        ) {
          commandPalette.close();
        } else {
          commandPalette.open("command", viewWindow);
        }
      }
    };

    viewWindow.addEventListener("keydown", handleShortcut);
    return () => viewWindow.removeEventListener("keydown", handleShortcut);
  }, [isActivePane, viewWindow]);

  useEffect(() => {
    if (!openedHere || !isActivePane) {
      return;
    }

    setIsUrlEditing(true);
    activate(paletteState.mode);
  }, [activate, isActivePane, paletteState.mode, openedHere, setIsUrlEditing]);

  useEffect(() => {
    if (!openedHere || !isActivePane || !isUrlEditing) {
      return;
    }

    // 変更理由: 入力欄はピルと入れ替わって現れるため、現れた直後に操作を引き継ぎ、
    // 候補取得を開始してそのまま入力できるようにする。
    urlInputRef.current?.focus();
  }, [isActivePane, isUrlEditing, openedHere, urlInputRef]);

  useEffect(() => {
    const isCommandPaletteActive = openedHere || (omnibarMode === "command" && isOmnibarOpen);
    if (!isActivePane || !isCommandPaletteActive) {
      return;
    }

    // 変更理由: OSや別ウィンドウへフォーカスが移ると入力欄のblurが発火しない環境があるため、
    // コマンドパレットが開いている間はウィンドウのフォーカスアウトでも状態を閉じる。
    const handleWindowBlur = () => {
      handleBlur();
      commandPalette.close();
    };
    viewWindow.addEventListener("blur", handleWindowBlur);
    return () => viewWindow.removeEventListener("blur", handleWindowBlur);
  }, [handleBlur, isActivePane, isOmnibarOpen, omnibarMode, openedHere, viewWindow]);

  return { ...paletteState, opened: openedHere };
}
