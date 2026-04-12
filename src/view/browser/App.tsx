import React from "react";
import { TabProvider } from "src/view/browser/hooks/use-tab-store";
import { TabBar } from "src/view/browser/components/TabBar";
import { NavigationBar } from "src/view/browser/components/NavigationBar";
import { ContentArea } from "src/view/browser/components/ContentArea";

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
