import React, { createContext, useContext, useEffect, useState } from "react";

declare const app: any;
declare const UI: any;

interface AppContextType {
  app: any;
  UI: any;
  config: any;
  isReady: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // appとUIがグローバルに読み込まれるのを待つ
    const checkReady = () => {
      if (typeof app !== "undefined" && typeof UI !== "undefined") {
        setIsReady(true);
      } else {
        setTimeout(checkReady, 50);
      }
    };
    checkReady();
  }, []);

  const value: AppContextType = {
    app: typeof app !== "undefined" ? app : null,
    UI: typeof UI !== "undefined" ? UI : null,
    config: typeof app !== "undefined" ? app.config : null,
    isReady,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
