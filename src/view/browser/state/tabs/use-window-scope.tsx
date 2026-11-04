import { createContext, type ReactNode, useContext } from "react";

// 旧セッションと Provider のない本窓で共通の識別子を使う。
export const MAIN_WINDOW_ID = "main";

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
