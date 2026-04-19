import React from "react";
import { ContentArea } from "src/view/browser/components/ContentArea";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { TabBar } from "src/view/browser/components/TabBar";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { TabProvider } from "src/view/browser/hooks/use-tab-store";

export const BrowserApp: React.FC = () => {
  const theme = useTheme();

  return (
    <TabProvider>
      <StatusBarProvider>
        {/* data-theme を使ってダークモード CSS 変数を切り替える */}
        <div className="browser-shell" data-theme={theme}>
          <div className="browser-shell__chrome">
            <TabBar />
            <NavigationBar />
          </div>
          <ContentArea />
          <StatusBar />
        </div>
      </StatusBarProvider>
    </TabProvider>
  );
};
