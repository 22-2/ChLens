import { Component, type ErrorInfo, type ReactNode } from "react";
import { createLogger } from "src/app/logger";
import { tabActions } from "src/view/browser/state/tabs/tab-store-actions";
import { useTabDispatch } from "src/view/browser/state/tabs/use-tab-store";

const logger = createLogger("browser");

interface TabErrorBoundaryProps {
  tabId: string;
  /** 失敗したページを記録から特定できるよう、ページの識別キーを渡す。 */
  pageKey: string;
  children: ReactNode;
}

interface TabErrorBoundaryState {
  failed: boolean;
}

/**
 * 1つのタブの描画例外を、そのタブの中で受け止める。
 *
 * 変更理由: 境界が無いと、1タブの描画例外で画面全体が空になり、閉じる操作もできなくなる。
 * 失敗を記録したうえで、そのタブだけを閉じられる導線を出して他のタブの操作を残す。
 */
export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  override state: TabErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): TabErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    logger.error(`タブの描画に失敗しました (${this.props.pageKey}):`, error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <TabErrorFallback tabId={this.props.tabId} />;
    }
    return this.props.children;
  }
}

function TabErrorFallback({ tabId }: { tabId: string }) {
  const dispatch = useTabDispatch();

  return (
    <div className="tab-error" role="alert">
      <p className="tab-error__message">このページを表示できませんでした。</p>
      <button
        type="button"
        className="tab-error__close"
        onClick={() => dispatch(tabActions.closeTab(tabId))}
      >
        このタブを閉じる
      </button>
    </div>
  );
}
