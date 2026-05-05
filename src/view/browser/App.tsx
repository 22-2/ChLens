import { MantineProvider, createTheme } from "@mantine/core";
import { PenLine } from "lucide-react";
import React from "react";
import { Toaster } from "sonner";
import "sonner/dist/styles.css";
import { AutoRefreshStatusItem } from "src/view/browser/components/AutoRefreshStatusItem";
import { BookmarkRootSelectorDialog } from "src/view/browser/components/BookmarkRootSelectorDialog";
import { BottomPanel } from "src/view/browser/components/BottomPanel";
import { ContentArea } from "src/view/browser/components/ContentArea";
import { IkioiStatusItem } from "src/view/browser/components/IkioiStatusItem";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { NgStatusItem } from "src/view/browser/components/NgStatusItem";
import {
  StatusBar,
  StatusBarItem,
  StatusBarProvider,
} from "src/view/browser/components/StatusBar";
import { TabBar } from "src/view/browser/components/TabBar";
import { STATUS_BAR_PRIORITY } from "src/view/browser/components/status-bar-priority";
import { AutoScrollStateProvider } from "src/view/browser/hooks/use-auto-scroll-state";
import {
  BottomPanelProvider,
  useBottomPanel,
} from "src/view/browser/hooks/use-bottom-panel";
import { NgStatusProvider } from "src/view/browser/hooks/use-ng-status";
import { useNotificationListener } from "src/view/browser/hooks/use-notification-listener";
import { TabProvider, useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useTheme } from "src/view/browser/hooks/use-theme";

const mantineTheme = createTheme({
  fontFamily: '"Noto Sans JP", "Yu Gothic UI", sans-serif',
  defaultRadius: "md",
  primaryColor: "blue",
});

// ステータスバー左端に常設される書き込みパネル開閉ボタン
const WritePanelToggleItem: React.FC = () => {
  const { togglePanel } = useBottomPanel();
  const { currentPage } = useTabStore();

  // 書き込み UI はスレッド専用なので、他ページではステータスバーに出さない。
  if (currentPage.type !== "thread") {
    return null;
  }

  return (
    <StatusBarItem
      id="write-panel-toggle"
      alignment="right"
      priority={STATUS_BAR_PRIORITY.right.writePanelToggle}
      interactive
      // title={isOpen ? "書き込みパネルを閉じる" : "書き込みパネルを開く"}
    >
      <button
        className={`status-bar__btn`}
        onClick={() => togglePanel("write")}
      >
        <PenLine size={12} />
        <span>書き込み</span>
      </button>
    </StatusBarItem>
  );
};

export const BrowserApp: React.FC = () => {
  const theme = useTheme();
  useNotificationListener();

  return (
    <MantineProvider
      theme={mantineTheme}
      forceColorScheme={theme === "dark" ? "dark" : "light"}
    >
      <TabProvider>
        <StatusBarProvider>
          <NgStatusProvider>
            <BottomPanelProvider>
              <AutoScrollStateProvider>
                {/* data-theme を使ってダークモード CSS 変数を切り替える */}
                <div className="browser-shell" data-theme={theme}>
                  <Toaster
                    position="top-right"
                    theme={theme === "dark" ? "dark" : "light"}
                    offset={{
                      top: "88px",
                      right: "78px",
                    }}
                    duration={1500}
                    closeButton
                  />
                  <div className="browser-shell__chrome">
                    <TabBar />
                    <NavigationBar />
                  </div>
                  <ContentArea />
                  <BottomPanel />
                  <BookmarkRootSelectorDialog />
                  <NgStatusItem />
                  <IkioiStatusItem />
                  <AutoRefreshStatusItem />
                  <WritePanelToggleItem />
                  <StatusBar />
                </div>
              </AutoScrollStateProvider>
            </BottomPanelProvider>
          </NgStatusProvider>
        </StatusBarProvider>
      </TabProvider>
    </MantineProvider>
  );
};
