export const NG_DISPLAY_CONFIG_KEY = "display_ng";

export const NG_DISPLAY_MODES = ["hard-ng", "soft-ng", "highlight-ng"] as const;

export type NgDisplayMode = (typeof NG_DISPLAY_MODES)[number];

/** 新規設定では、NGレスを誤って露出させない完全非表示を既定値にする。 */
export const DEFAULT_NG_DISPLAY_MODE: NgDisplayMode = "hard-ng";

export const NG_DISPLAY_MODE_OPTIONS = [
  { const: "hard-ng", title: "完全非表示（hard-ng）" },
  { const: "soft-ng", title: "クリックで表示（soft-ng）" },
  { const: "highlight-ng", title: "表示して強調（highlight-ng）" },
] as const;

export function normalizeNgDisplayMode(value: string | null | undefined): NgDisplayMode {
  switch (value) {
    case "hard-ng":
    case "hard":
    case "off":
      return "hard-ng";
    case "soft-ng":
    case "soft":
    case "on":
      return "soft-ng";
    case "highlight-ng":
    case "highlight":
      return "highlight-ng";
    default:
      // 未知値でもNGレスを本文のまま露出させず、安全側の既定値へ戻す。
      return DEFAULT_NG_DISPLAY_MODE;
  }
}
