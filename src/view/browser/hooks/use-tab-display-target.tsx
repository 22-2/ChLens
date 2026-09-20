import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface TabDisplayTarget {
  /** 表示対象タブが所属するペイン。操作の暗黙スコープにも使う。 */
  paneId: string;
  /** この表示領域が描画するタブ。メイン画面では指定しない。 */
  tabId: string;
}

const TabDisplayTargetContext = createContext<TabDisplayTarget | null>(null);

/**
 * タブ本体を表示している領域の対象を固定する。
 *
 * 変更理由: 別窓は元ペインのactiveTabを変更せずに同じタブを表示するため、
 * 共通のタイトルバーやステータス項目が「表示中のタブ」を参照できる境界が必要になる。
 */
export const TabDisplayTargetProvider: React.FC<{
  target: TabDisplayTarget;
  children: ReactNode;
}> = ({ target, children }) => {
  const value = useMemo(
    () => ({ paneId: target.paneId, tabId: target.tabId }),
    [target.paneId, target.tabId],
  );
  return (
    <TabDisplayTargetContext.Provider value={value}>{children}</TabDisplayTargetContext.Provider>
  );
};

export function useTabDisplayTarget(): TabDisplayTarget | null {
  return useContext(TabDisplayTargetContext);
}
