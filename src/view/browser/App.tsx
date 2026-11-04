import React, { useEffect } from "react";
import { useArchiveReplayMainThreadSync } from "src/features/archive-replay/browser/use-main-thread-sync";
import { AutoScrollPaneStatesProvider } from "src/features/auto-refresh/browser/use-auto-scroll-state";
import { BookmarkRootSelectorDialog } from "src/features/bookmark/ui/BookmarkRootSelectorDialog";
import { CommentOverlayJumpBridge } from "src/features/comment-overlay/ui/CommentOverlayJumpBridge";
import { OverlayPlacementWindowProvider } from "src/features/comment-overlay/ui/OverlayPlacementWindow";
import { useTabBarOrientation } from "src/features/tabs/browser/use-tab-bar-orientation";
import { WindowNavigationBridge } from "src/features/tabs/ui/WindowNavigationBridge";
import { WriteSessionProvider } from "src/features/write/browser/use-write-session";
import { WriteWindowHost } from "src/features/write/ui/WriteWindowHost";
import { container } from "src/service-container/index";
import { useZenMode } from "src/view/browser/commands/zen-mode-store";
import { useNotificationListener } from "src/view/browser/hooks/use-notification-listener";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { TabWindowHost } from "src/view/browser/shell/TabWindowHost";
import { WindowShell } from "src/view/browser/shell/WindowShell";
import { TabProvider } from "src/view/browser/state/tabs/use-tab-store";
import { ToastProvider } from "src/view/browser/ui/Toast";
import { TooltipProvider } from "src/view/browser/ui/Tooltip";
import { useAnyFilterToolbarOpen } from "src/view/browser/utils/filter-toolbar-open-state";
import { applyBBSMenuToItestServerMap } from "src/view/browser/utils/itest-server-map";

export const BrowserApp: React.FC = () => {
  const theme = useTheme();
  const isZenMode = useZenMode();
  // 変更理由: 垂直モードではタイトルバーをペイン単位にするため、シェル側の共通表示を切り替える。
  const shellTabBarOrientation = useTabBarOrientation();
  useNotificationListener();

  // 変更理由: URL解決用のサーバー対応表は板一覧から更新し、画面の操作中は同期参照できるようにする。
  // 前回セッションの localStorage キャッシュがあるため、ここでの取得は
  // 次回以降の起動に備えた更新も兼ねる。
  useEffect(() => {
    void container.bbsMenu
      .get(false)
      .then((result) => {
        if (result.status === "success" && result.menu) {
          applyBBSMenuToItestServerMap(result.menu);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <TooltipProvider>
      <TabProvider>
        <WriteSessionProvider>
          {/* 実況の表示位置調整窓は、各ペインと切り離したタブの両方から開けるよう外側に置く。 */}
          <OverlayPlacementWindowProvider>
            <TabWindowHost>
              <CommentOverlayJumpBridge />
              <WriteWindowHost />
              <ArchiveReplayMainThreadSyncBridge />
              {/*
              ステータス／NG／書き込み／自動スクロールの各プロバイダは PaneColumn 内へ移設した。
              シェル直下には全ペイン共通のグローバル UI（トースト・ダイアログ）だけを残す。
            */}
              {/* data-theme を使ってダークモード CSS 変数を切り替える */}
              <div
                className="browser-shell"
                data-theme={theme}
                data-tab-orientation={shellTabBarOrientation}
                data-zen-mode={isZenMode ? "true" : "false"}
              >
                <WindowNavigationBridge />
                {/* 変更理由: 本文を覆う範囲を減らし、通知を上部バー直下の右端へ寄せる。
                    URL入力はタイトルバー内でピルと入れ替わるだけで行が増えないため、
                    入力中でも通知の位置は変えない。 */}
                <ShellToastProvider />
                {/*
                水平モードではタイトルと必須のレイアウト操作はペインの外に置く。
                これにより2ペイン時も操作が重複せず、アクティブペインのタイトルだけを表示できる。
                垂直モードでも操作対象をアクティブペインに揃え、タイトルバーを共有する。
              */}
                <AutoScrollPaneStatesProvider>
                  <WindowShell />
                </AutoScrollPaneStatesProvider>
                <BookmarkRootSelectorDialog />
              </div>
            </TabWindowHost>
          </OverlayPlacementWindowProvider>
        </WriteSessionProvider>
      </TabProvider>
    </TooltipProvider>
  );
};

const ShellToastProvider: React.FC = () => {
  const isFilterToolbarOpen = useAnyFilterToolbarOpen();
  // 変更理由: フィルタバーは上部バー直下の本文先頭に出るため、開いている間は通知をその下へずらして重ならないようにする。
  const topOffset = isFilterToolbarOpen
    ? "calc(var(--sys-space-13) + var(--sys-space-16))"
    : "var(--sys-space-13)";

  return <ToastProvider topOffset={topOffset} rightOffset="var(--sys-space-4)" />;
};

const ArchiveReplayMainThreadSyncBridge: React.FC = () => {
  useArchiveReplayMainThreadSync();
  return null;
};
