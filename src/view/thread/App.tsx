import React from "react";
import { AppProvider } from "src/view/thread/context/AppContext";
import { ViewProvider } from "src/view/thread/context/ViewContext";
import { ThreadView } from "src/view/thread/ThreadView";
import "./styles/globals.css";

interface AppProps {
  initialView?: string;
  initialParams?: Record<string, any>;
}

export const App: React.FC<AppProps> = ({ initialView, initialParams }) => {
  return (
    <AppProvider>
      <ViewProvider>
        <div className="app-container">
          {/* 将来的には複数のビューをここで切り替え */}
          <ThreadView viewUrl={initialParams?.q || ""} />
        </div>
      </ViewProvider>
    </AppProvider>
  );
};
