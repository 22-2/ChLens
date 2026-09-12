import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";

export const TABLE_TOOLTIP_CONFIG_KEY = "table_tooltip";

export function useTableTooltipEnabled(): boolean {
  const { value: enabled } = useConfigBooleanSetting(TABLE_TOOLTIP_CONFIG_KEY, true);
  return enabled;
}
