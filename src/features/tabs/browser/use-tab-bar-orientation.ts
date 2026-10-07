import { useCallback, useEffect, useState } from "react";
import {
  persistConfigValue,
  readConfigValue,
  subscribeConfigKeys,
} from "src/view/browser/utils/config-setting";

export type TabBarOrientation = "horizontal" | "vertical";

export const TAB_BAR_ORIENTATION_CONFIG_KEY = "tab_bar_orientation";
export const TAB_BAR_COLLAPSED_CONFIG_KEY = "tab_bar_collapsed";
export const TAB_BAR_WIDTH_CONFIG_KEY = "tab_bar_width";

export const TAB_BAR_WIDTH_DEFAULT = 208;
export const TAB_BAR_WIDTH_MIN = 160;
export const TAB_BAR_WIDTH_MAX = 280;
// 変更理由: 簡易表示の固定幅。縮小中のリサイズ開始位置やドラッグ上限の基準にする。
export const TAB_BAR_COLLAPSED_WIDTH = 48;

function parseOrientation(raw: string | null | undefined): TabBarOrientation {
  // 変更理由: 垂直タブバー導入前の既存環境や未知値では水平として扱い、
  // 設定を持たない利用者の見た目を変えない。
  if (raw === "vertical") {
    return "vertical";
  }
  return "horizontal";
}

/** tab_bar_orientation 設定値を監視し、タブバーの配置方向を返すフック */
export function useTabBarOrientation(): TabBarOrientation {
  const [orientation, setOrientation] = useState<TabBarOrientation>(() =>
    parseOrientation(readConfigValue(TAB_BAR_ORIENTATION_CONFIG_KEY)),
  );

  useEffect(
    () =>
      subscribeConfigKeys(
        [TAB_BAR_ORIENTATION_CONFIG_KEY],
        () => {
          setOrientation(parseOrientation(readConfigValue(TAB_BAR_ORIENTATION_CONFIG_KEY)));
        },
        { label: "TabBarSettings" },
      ),
    [],
  );

  return orientation;
}

export function clampTabBarWidth(raw: number): number {
  // 変更理由: ドラッグ中や手動編集で範囲外の値が来ても、レイアウトが破綻しない幅に丸める。
  if (!Number.isFinite(raw)) {
    return TAB_BAR_WIDTH_DEFAULT;
  }
  return Math.min(TAB_BAR_WIDTH_MAX, Math.max(TAB_BAR_WIDTH_MIN, Math.round(raw)));
}

function parseTabBarWidth(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === "") {
    return TAB_BAR_WIDTH_DEFAULT;
  }
  // 変更理由: 数値以外が入っていても既定幅で表示を保ち、設定画面の再保存を待たない。
  return clampTabBarWidth(Number.parseFloat(raw));
}

function parseTabBarCollapsed(raw: string | null | undefined): boolean {
  // 変更理由: 垂直バーの既定は縮小モードとし、未設定の環境でも細幅で表示して本文の幅を優先する。
  if (raw == null) {
    return true;
  }
  return raw === "on";
}

/** 垂直タブバーの簡易表示と展開幅を監視・更新するフック */
export function useVerticalTabBarLayout(): {
  collapsed: boolean;
  width: number;
  setCollapsed: (collapsed: boolean) => void;
  setWidth: (width: number) => void;
} {
  const [collapsed, setCollapsedState] = useState(() =>
    parseTabBarCollapsed(readConfigValue(TAB_BAR_COLLAPSED_CONFIG_KEY)),
  );
  const [width, setWidthState] = useState(() =>
    parseTabBarWidth(readConfigValue(TAB_BAR_WIDTH_CONFIG_KEY)),
  );

  useEffect(() => {
    const sync = () => {
      setCollapsedState(parseTabBarCollapsed(readConfigValue(TAB_BAR_COLLAPSED_CONFIG_KEY)));
      setWidthState(parseTabBarWidth(readConfigValue(TAB_BAR_WIDTH_CONFIG_KEY)));
    };
    const unsubscribeCollapsed = subscribeConfigKeys([TAB_BAR_COLLAPSED_CONFIG_KEY], sync, {
      label: "TabBarSettings",
    });
    const unsubscribeWidth = subscribeConfigKeys([TAB_BAR_WIDTH_CONFIG_KEY], sync, {
      label: "TabBarSettings",
    });
    return () => {
      unsubscribeCollapsed();
      unsubscribeWidth();
    };
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    // 変更理由: 切替操作は即時に見た目へ反映し、保存は裏で続ける。保存失敗時は
    // ログに残し、次回起動時の既定（展開表示）へ戻す。
    setCollapsedState(next);
    persistConfigValue(TAB_BAR_COLLAPSED_CONFIG_KEY, next ? "on" : "off");
  }, []);

  const setWidth = useCallback((next: number) => {
    // 変更理由: ドラッグ確定時に範囲内へ丸めてから保存し、異常値での永続化を防ぐ。
    const clamped = clampTabBarWidth(next);
    setWidthState(clamped);
    persistConfigValue(TAB_BAR_WIDTH_CONFIG_KEY, String(clamped));
  }, []);

  return { collapsed, width, setCollapsed, setWidth };
}
