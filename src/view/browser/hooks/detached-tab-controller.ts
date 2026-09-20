import { createContext } from "react";

export interface DetachedTabController {
  isDetachedTab: (tabId: string) => boolean;
  detachTab: (tabId: string) => boolean;
  /** 別窓だけを閉じ、タブを元ペインへ戻す。 */
  reattachTab: (tabId: string) => void;
  /** 別窓とタブを一緒に閉じる。 */
  closeDetachedTab: (tabId: string) => void;
  focusTabWindow: (tabId: string) => void;
}

export const defaultDetachedTabController: DetachedTabController = {
  isDetachedTab: () => false,
  detachTab: () => false,
  reattachTab: () => {},
  closeDetachedTab: () => {},
  focusTabWindow: () => {},
};

export const DetachedTabControllerContext = createContext<DetachedTabController>(
  defaultDetachedTabController,
);
