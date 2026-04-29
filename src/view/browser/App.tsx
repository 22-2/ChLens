import { PenLine } from "lucide-react";
import React from "react";
import { BottomPanel } from "src/view/browser/components/BottomPanel";
import { ContentArea } from "src/view/browser/components/ContentArea";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import {
  StatusBar,
  StatusBarItem,
  StatusBarProvider,
} from "src/view/browser/components/StatusBar";
import { TabBar } from "src/view/browser/components/TabBar";
import { BottomPanelProvider, useBottomPanel } from "src/view/browser/hooks/use-bottom-panel";
import { TabProvider } from "src/view/browser/hooks/use-tab-store";
import { useTheme } from "src/view/browser/hooks/use-theme";

// ステータスバー左端に常設される書き込みパネル開閉ボタン
const WritePanelToggleItem: React.FC = () => {
  const { togglePanel } = useBottomPanel();
  return (
    <StatusBarItem
      id="write-panel-toggle"
      alignment="right"
      priority={0}
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

  return (
    <TabProvider>
      <StatusBarProvider>
        <BottomPanelProvider>
          {/* data-theme を使ってダークモード CSS 変数を切り替える */}
          <div className="browser-shell" data-theme={theme}>
            <div className="browser-shell__chrome">
              <TabBar />
              <NavigationBar />
            </div>
            <ContentArea />
            <BottomPanel />
            <WritePanelToggleItem />
            <StatusBar />
          </div>
        </BottomPanelProvider>
      </StatusBarProvider>
    </TabProvider>
  );
};
