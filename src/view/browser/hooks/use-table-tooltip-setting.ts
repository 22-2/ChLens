import { useEffect, useState } from "react";
import { container } from "src/service-container/index";

export const TABLE_TOOLTIP_CONFIG_KEY = "table_tooltip";

function readTableTooltipEnabled(): boolean {
  // 変更理由: 従来ツールチップが表示されていた一覧の挙動を維持するため、
  // 未設定の既存環境でも明示的にOFFでない限り有効として扱う。
  return container.config.get(TABLE_TOOLTIP_CONFIG_KEY) !== "off";
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

    container.config.ready(sync);
    container.message.on("config_updated", handleConfigUpdated);

    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  return enabled;
}
