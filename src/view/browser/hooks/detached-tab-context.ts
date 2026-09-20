import { createContext, useContext } from "react";

export interface DetachedTabWindowContextValue {
  isDetached: (tabId: string) => boolean;
  openTab: (tabId: string) => boolean;
  /** 別窓だけを閉じ、タブを元ペインへ戻す。 */
  redockTab: (tabId: string) => void;
  /** 別窓とタブを一緒に閉じる。 */
  closeDetachedTab: (tabId: string) => void;
  focusTab: (tabId: string) => void;
  toggleTab: (tabId: string) => boolean;
}

export const defaultDetachedTabWindowContext: DetachedTabWindowContextValue = {
  isDetached: () => false,
  openTab: () => false,
  redockTab: () => {},
  closeDetachedTab: () => {},
  focusTab: () => {},
  toggleTab: () => false,
};

export const DetachedTabWindowContext = createContext<DetachedTabWindowContextValue>(
  defaultDetachedTabWindowContext,
);

/**
 * 別窓の状態だけを読む軽量な入口。
 *
 * 変更理由: ContentAreaや下部パネルは別窓のページ実装を読み込む必要がないため、
 * platformやTabPanelを含む重いホストからContextを切り離し、拡張APIなしのテストや
 * 埋め込み画面でも同じ表示部品を読み込めるようにする。
 */
export function useDetachedTabs(): DetachedTabWindowContextValue {
  return useContext(DetachedTabWindowContext);
}
