import { createContext, type ReactNode, useContext } from "react";
import { MAIN_WINDOW_ID } from "src/view/browser/state/tabs/window-model";

const WindowScopeContext = createContext(MAIN_WINDOW_ID);

export function WindowScopeProvider({
  windowId,
  children,
}: {
  windowId: string;
  children: ReactNode;
}) {
  return <WindowScopeContext.Provider value={windowId}>{children}</WindowScopeContext.Provider>;
}

export function useWindowId(): string {
  return useContext(WindowScopeContext);
}
