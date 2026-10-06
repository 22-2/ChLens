import type { FormEvent } from "react";
import { useCallback, useState } from "react";
import { commandPalette } from "src/view/browser/commands/command-palette-store";
import type { Page } from "src/view/browser/types";
import { requestThreadResJump } from "src/view/browser/utils/thread-read-state";

/**
 * スレッドの指定レス番号へ移動するためのダイアログ状態。
 *
 * 変更理由: 入力値・検証・ジャンプ要求はNavigationBarの描画と無関係に完結するため、
 * フックへ切り出して画面側は開閉と表示だけを扱う。
 */
export function useResponseJumpDialog(viewPage: Page) {
  const [isResponseJumpDialogOpen, setIsResponseJumpDialogOpen] = useState(false);
  const [responseJumpValue, setResponseJumpValue] = useState("");
  const [responseJumpError, setResponseJumpError] = useState<string | null>(null);

  const openResponseJumpDialog = useCallback(() => {
    if (viewPage.type !== "thread") return;

    // コマンド実行後にオムニバーを確実に閉じ、数値入力へ操作を引き継ぐ。
    commandPalette.close();
    setResponseJumpValue("");
    setResponseJumpError(null);
    setIsResponseJumpDialogOpen(true);
  }, [viewPage.type]);

  const closeResponseJumpDialog = useCallback(() => {
    setIsResponseJumpDialogOpen(false);
    setResponseJumpError(null);
  }, []);

  const submitResponseJump = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (viewPage.type !== "thread") return;

      if (!/^\d+$/.test(responseJumpValue.trim())) {
        setResponseJumpError("1以上のレス番号を入力してください");
        return;
      }

      const resNum = Number.parseInt(responseJumpValue.trim(), 10);
      if (!Number.isSafeInteger(resNum) || resNum <= 0) {
        setResponseJumpError("1以上のレス番号を入力してください");
        return;
      }

      requestThreadResJump(viewPage.threadUrl, resNum);
      closeResponseJumpDialog();
    },
    [closeResponseJumpDialog, responseJumpValue, viewPage],
  );

  return {
    isResponseJumpDialogOpen,
    responseJumpValue,
    setResponseJumpValue,
    responseJumpError,
    openResponseJumpDialog,
    closeResponseJumpDialog,
    submitResponseJump,
  };
}
