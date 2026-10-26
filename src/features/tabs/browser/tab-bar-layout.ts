import type { Tab } from "src/view/browser/types";

// タブバーの配置・幅と、表示部品へ渡すタブ1枚分の型。
// 設定の読み書き（config-setting）やストアに依存させないため、ストーリーや表示部品からも安全に読み込める。
export type TabBarOrientation = "horizontal" | "vertical";

/** 表示部品へ渡す、タブ1枚分の描画情報。 */
export interface TabBarItem {
  tab: Tab;
  isActive: boolean;
  autoRefreshIndicatorState: "active" | "inactive" | null;
}

export const TAB_BAR_WIDTH_DEFAULT = 208;
export const TAB_BAR_WIDTH_MIN = 160;
export const TAB_BAR_WIDTH_MAX = 280;
// 変更理由: 簡易表示の固定幅。縮小中のリサイズ開始位置やドラッグ上限の基準にする。
export const TAB_BAR_COLLAPSED_WIDTH = 48;

export function clampTabBarWidth(raw: number): number {
  // 変更理由: ドラッグ中や手動編集で範囲外の値が来ても、レイアウトが破綻しない幅に丸める。
  if (!Number.isFinite(raw)) {
    return TAB_BAR_WIDTH_DEFAULT;
  }
  return Math.min(TAB_BAR_WIDTH_MAX, Math.max(TAB_BAR_WIDTH_MIN, Math.round(raw)));
}
