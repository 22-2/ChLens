import { useCallback, useEffect, useState } from "react";
import { container } from "src/service-container/index";

export type TabBarOrientation = "horizontal" | "vertical";

export const TAB_BAR_ORIENTATION_CONFIG_KEY = "tab_bar_orientation";
export const TAB_BAR_COLLAPSED_CONFIG_KEY = "tab_bar_collapsed";
export const TAB_BAR_WIDTH_CONFIG_KEY = "tab_bar_width";

export const TAB_BAR_WIDTH_DEFAULT = 208;
export const TAB_BAR_WIDTH_MIN = 160;
export const TAB_BAR_WIDTH_MAX = 280;

function readConfigString(key: string): string | null {
  try {
    return container.config.get(key);
  } catch (error) {
    // LiveのようにChlensのservice containerを使わないhostでも、既定値で表示できる。
    console.error(
      `[TabBarSettings] config service is unavailable; using the default for ${key}`,
      error,
    );
    return null;
  }
}

function persistConfigValue(key: string, value: string): void {
  void Promise.resolve(container.config.set(key, value)).catch((error) => {
    console.error(`[TabBarSettings] config の保存に失敗しました: ${key}`, error);
  });
}

/** 指定キーの変更通知を購読し、変更時に sync を呼び出す。 */
function subscribeConfigKey(key: string, sync: () => void): () => void {
  try {
    // 変更理由: Config は localStorage の読み込み後に確定するため、初回レンダー時の
    // 既定値だけで決めると、再起動後に保存済みの設定を取りこぼす。
    container.config.ready(sync);
    const handleConfigUpdated = ({ key: updatedKey }: { key?: string }) => {
      if (updatedKey === key) {
        sync();
      }
    };
    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  } catch (error) {
    // 設定serviceが後から登録されるhostでは購読を省略し、初期値のまま表示を継続する。
    console.error("[TabBarSettings] config service subscription is unavailable", error);
    return () => undefined;
  }
}

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
    parseOrientation(readConfigString(TAB_BAR_ORIENTATION_CONFIG_KEY)),
  );

  useEffect(
    () =>
      subscribeConfigKey(TAB_BAR_ORIENTATION_CONFIG_KEY, () => {
        setOrientation(parseOrientation(readConfigString(TAB_BAR_ORIENTATION_CONFIG_KEY)));
      }),
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

/** 垂直タブバーの簡易表示と展開幅を監視・更新するフック */
export function useVerticalTabBarLayout(): {
  collapsed: boolean;
  width: number;
  setCollapsed: (collapsed: boolean) => void;
  setWidth: (width: number) => void;
} {
  const [collapsed, setCollapsedState] = useState(
    () => readConfigString(TAB_BAR_COLLAPSED_CONFIG_KEY) === "on",
  );
  const [width, setWidthState] = useState(() =>
    parseTabBarWidth(readConfigString(TAB_BAR_WIDTH_CONFIG_KEY)),
  );

  useEffect(() => {
    const sync = () => {
      setCollapsedState(readConfigString(TAB_BAR_COLLAPSED_CONFIG_KEY) === "on");
      setWidthState(parseTabBarWidth(readConfigString(TAB_BAR_WIDTH_CONFIG_KEY)));
    };
    const unsubscribeCollapsed = subscribeConfigKey(TAB_BAR_COLLAPSED_CONFIG_KEY, sync);
    const unsubscribeWidth = subscribeConfigKey(TAB_BAR_WIDTH_CONFIG_KEY, sync);
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
