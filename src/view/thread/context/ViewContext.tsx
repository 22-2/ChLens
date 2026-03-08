import React, { createContext, useContext, useState } from "react";

type ViewType = "thread" | "board" | "bookmark" | "history" | "search";

interface ViewContextType {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  viewParams: Record<string, any>;
  setViewParams: (params: Record<string, any>) => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export const ViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<ViewType>("thread");
  const [viewParams, setViewParams] = useState<Record<string, any>>({});

  return (
    <ViewContext.Provider
      value={{
        currentView,
        setCurrentView,
        viewParams,
        setViewParams,
      }}
    >
      {children}
    </ViewContext.Provider>
  );
};

export const useView = () => {
  const context = useContext(ViewContext);
  if (context === undefined) {
    throw new Error("useView must be used within a ViewProvider");
  }
  return context;
};
