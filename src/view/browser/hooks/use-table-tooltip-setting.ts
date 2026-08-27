import { useEffect, useState } from "react";
import { container } from "src/service-container/index";

export const TABLE_TOOLTIP_CONFIG_KEY = "table_tooltip";

function readTableTooltipEnabled(): boolean {
  // 変更理由: 従来ツールチップが表示されていた一覧の挙動を維持するため、
  // 未設定の既存環境でも明示的にOFFでない限り有効として扱う。
  try {
    return container.config.get(TABLE_TOOLTIP_CONFIG_KEY) !== "off";
  } catch (error) {
    // LiveのようにChlensのservice containerを使わないhostでも、一覧表は既定のtooltip有効で表示できる。
    console.error("[TableTooltip] config service is unavailable; using the default", error);
    return true;
  }
}

export function useTableTooltipEnabled(): boolean {
  const [enabled, setEnabled] = useState(readTableTooltipEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readTableTooltipEnabled());
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key === TABLE_TOOLTIP_CONFIG_KEY) {
        sync();
      }
    };

    try {
      container.config.ready(sync);
      container.message.on("config_updated", handleConfigUpdated);
    } catch (error) {
      // 設定serviceが後から登録されるhostでは購読を省略し、初期値のまま表示を継続する。
      console.error("[TableTooltip] config service subscription is unavailable", error);
      return;
    }

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  return enabled;
}
