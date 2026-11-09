import { useCallback, useState } from "react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import type { useToast } from "src/view/browser/hooks/use-toast";
import { sanitizeUrlsInText } from "src/view/browser/utils/url-tracking";
import {
  findUrlTrackingWarning,
  findWriteWarnings,
  type WriteWarning,
} from "src/view/browser/utils/write-warning";

/** 名前・メール・本文に対する、投稿前の警告（個人情報らしき文字列、URLの追跡パラメータ）を集める。 */
export function collectPreSubmitWarnings(
  name: string,
  mail: string,
  message: string,
): WriteWarning[] {
  const warnings = findWriteWarnings([name, mail, message]);
  const trackingWarning = findUrlTrackingWarning(message);
  if (trackingWarning) warnings.push(trackingWarning);
  return warnings;
}

interface UseWritePreSubmitWarningsOptions {
  name: string;
  mail: string;
  message: string;
  canSubmit: boolean;
  isSubmitting: boolean;
  /** 引数を渡すと、編集欄の状態ではなくその本文で投稿する。 */
  submit: (message?: string) => unknown;
  setMessage: (message: string) => void;
  toast: ReturnType<typeof useToast>;
}

/**
 * 投稿の入口。警告が見つかったときは確認ダイアログの状態を立て、無ければそのまま投稿する。
 */
export function useWritePreSubmitWarnings({
  name,
  mail,
  message,
  canSubmit,
  isSubmitting,
  submit,
  setMessage,
  toast,
}: UseWritePreSubmitWarningsOptions) {
  const { value: preSubmitWarningsEnabled } = useConfigBooleanSetting("write_pre_submit_warnings");
  const [isWarningDialogOpen, setIsWarningDialogOpen] = useState(false);
  const [writeWarnings, setWriteWarnings] = useState<WriteWarning[]>([]);

  const requestSubmit = useCallback(() => {
    if (!canSubmit || isSubmitting) return;
    // 変更理由: 設定をOFFにした場合は投稿前の個人情報チェックと確認ダイアログを省略する。
    if (!preSubmitWarningsEnabled) {
      void submit();
      return;
    }
    const warnings = collectPreSubmitWarnings(name, mail, message);
    if (warnings.length > 0) {
      setWriteWarnings(warnings);
      setIsWarningDialogOpen(true);
      return;
    }
    void submit();
  }, [canSubmit, isSubmitting, mail, message, name, preSubmitWarningsEnabled, submit]);

  const removeTrackingParametersAndSubmit = useCallback(() => {
    const result = sanitizeUrlsInText(message);
    if (result.removedParameters.length === 0) return;

    // 変更理由: 除去を選んだ場合も編集欄へ反映し、実際の送信本文と表示内容を一致させる。
    setMessage(result.text);
    toast.success("URLパラメータを除去しました");
    const remainingWarnings = collectPreSubmitWarnings(name, mail, result.text);
    setWriteWarnings(remainingWarnings);

    if (remainingWarnings.length === 0) {
      setIsWarningDialogOpen(false);
      void submit(result.text);
    }
  }, [mail, message, name, setMessage, submit, toast]);

  const confirmWarningSubmit = useCallback(() => {
    setIsWarningDialogOpen(false);
    void submit();
  }, [submit]);

  return {
    requestSubmit,
    writeWarnings,
    isWarningDialogOpen,
    setIsWarningDialogOpen,
    removeTrackingParametersAndSubmit,
    confirmWarningSubmit,
  };
}
