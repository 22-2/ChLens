import React from "react";
import { AppProvider } from "./context/AppContext";
import { ViewProvider } from "./context/ViewContext";
import { ThreadView } from "./ThreadView";
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
