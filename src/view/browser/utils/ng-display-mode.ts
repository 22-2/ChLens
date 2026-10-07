import { DEFAULT_CONFIG } from "src/app/config-defaults";

export const NG_DISPLAY_CONFIG_KEY = "display_ng";

export const NG_DISPLAY_MODES = ["hard-ng", "soft-ng", "highlight-ng"] as const;

export type NgDisplayMode = (typeof NG_DISPLAY_MODES)[number];

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

/**
 * レスごとの実効的なNG表示方式を求める。
 * collapseルールに一致したレスは、全体設定にかかわらずクリックで表示できる折りたたみにする。
 * それ以外（hideルール・自動NG・連鎖NG）は全体設定に従う。
 */
export function resolveNgDisplayMode(
  globalMode: NgDisplayMode,
  ng: { readonly action?: string } | null | undefined,
): NgDisplayMode {
  return ng?.action === "collapse" ? "soft-ng" : globalMode;
}

// 変更理由: NG表示方式の実効既定値も、保存設定の既定値を正規化して一元管理する。
export const DEFAULT_NG_DISPLAY_MODE = normalizeNgDisplayMode(DEFAULT_CONFIG.display_ng);
