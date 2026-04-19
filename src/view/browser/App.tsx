import React from "react";
import { ContentArea } from "src/view/browser/components/ContentArea";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";
import { TabBar } from "src/view/browser/components/TabBar";
import { TabProvider } from "src/view/browser/hooks/use-tab-store";

export const BrowserApp: React.FC = () => {
  return (
    <TabProvider>
      <StatusBarProvider>
        <div className="browser-shell">
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
