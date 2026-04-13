import React from "react";
import { ContentArea } from "src/view/browser/components/ContentArea";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { TabBar } from "src/view/browser/components/TabBar";
import { TabProvider } from "src/view/browser/hooks/use-tab-store";

export const BrowserApp: React.FC = () => {
  return (
    <TabProvider>
      <div className="browser-shell">
        <div className="browser-shell__chrome">
          <TabBar />
          <NavigationBar />
        </div>
        <ContentArea />
      </div>
    </TabProvider>
  );
};
