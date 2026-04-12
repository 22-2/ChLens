import React from "react";
import { TabProvider } from "./hooks/use-tab-store";
import { TabBar } from "./components/TabBar";
import { NavigationBar } from "./components/NavigationBar";
import { ContentArea } from "./components/ContentArea";

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
