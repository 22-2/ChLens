import { createRoot } from "react-dom/client";
import { createLogger } from "src/app/logger";
import { platform } from "src/app/platform/index";
import { toastStore } from "src/service-container/toast-store";
import { ExternalLinkDialog } from "src/view/browser/ui/ExternalLinkDialog";
import { readConfigValue, subscribeConfigKeys } from "src/view/browser/utils/config-setting";
import {
  analyzeExternalLink,
  EXTERNAL_LINK_CONFIRM_CONFIG_KEY,
} from "src/view/browser/utils/external-link-analysis";

const logger = createLogger("url");
const pendingByWindow = new WeakMap<Window, () => void>();

export function isExternalLinkConfirmationEnabled(): boolean {
  return readConfigValue(EXTERNAL_LINK_CONFIRM_CONFIG_KEY) === "on";
}

export interface ExternalLinkOpenOptions {
  sourceWindow?: Window;
  active?: boolean;
  newWindow?: boolean;
  /** 変更理由: 表示元の窓や既存のプラットフォーム固有の開き方を、承認後も維持する。 */
  open?: (url: string) => void | Promise<void>;
}

export function requestExternalLink(url: string, options: ExternalLinkOpenOptions = {}): void {
  const sourceWindow = options.sourceWindow ?? window;
  const performOpen = (destination: string) => {
    try {
      const result = options.open
        ? options.open(destination)
        : options.newWindow
          ? platform.window.openWindow({ url: destination })
          : platform.window.openUrlInTab(destination, options.active ?? true);
      void Promise.resolve(result).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  };
  const reportError = (error: unknown) => {
    logger.error("外部リンクを開けませんでした", error);
    toastStore.error("外部リンクを開けませんでした", { targetWindow: sourceWindow });
  };
  if (!isExternalLinkConfirmationEnabled()) {
    performOpen(url);
    return;
  }
  // 変更理由: ポップアップ・画像別窓でも操作元に確認を出す。連打では確認を置き換え、古い承認を残さない。
  pendingByWindow.get(sourceWindow)?.();
  const targetDocument = sourceWindow.document;
  const previousFocus = targetDocument.activeElement as HTMLElement | null;
  const host = targetDocument.createElement("div");
  targetDocument.body.append(host);
  const root = createRoot(host);
  let finished = false;
  let unsubscribe = () => {};
  const cancel = () => {
    if (finished) return;
    finished = true;
    pendingByWindow.delete(sourceWindow);
    sourceWindow.removeEventListener("pagehide", cancel);
    unsubscribe();
    root.unmount();
    host.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  pendingByWindow.set(sourceWindow, cancel);
  sourceWindow.addEventListener("pagehide", cancel, { once: true });
  root.render(
    <ExternalLinkDialog
      analysis={analyzeExternalLink(url)}
      targetDocument={targetDocument}
      onCancel={cancel}
      onApprove={(destination) => {
        if (finished) return;
        cancel();
        performOpen(destination);
      }}
    />,
  );
  unsubscribe = subscribeConfigKeys([EXTERNAL_LINK_CONFIRM_CONFIG_KEY], () => {
    if (!isExternalLinkConfirmationEnabled()) cancel();
  });
}
