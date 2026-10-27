import type { SidePanelState } from "./tab-store-types";

export const SIDE_PANEL_VIEWS = [
  "boards",
  "favorites",
  "images",
  "extract",
  "properties",
  "write",
] as const;
export const DEFAULT_SIDE_PANEL: SidePanelState = {
  isOpen: false,
  width: 320,
  views: [...SIDE_PANEL_VIEWS],
  activeView: "boards",
};

/** パネルを開いて指定のビューを選ぶ。幅と並び順は利用者の設定をそのまま保つ。 */
export function showSidePanelView(
  value: unknown,
  view: (typeof SIDE_PANEL_VIEWS)[number],
): SidePanelState {
  return { ...normalizeSidePanel(value), isOpen: true, activeView: view };
}

/** 保存値の破損や古いビュー種別で画面全体が開けなくならないようにする。 */
export function normalizeSidePanel(value: unknown): SidePanelState {
  if (!value || typeof value !== "object")
    return { ...DEFAULT_SIDE_PANEL, views: [...SIDE_PANEL_VIEWS] };
  const input = value as Partial<SidePanelState>;
  const allowed = new Set<string>(SIDE_PANEL_VIEWS);
  const saved = Array.isArray(input.views)
    ? input.views.filter((id): id is string => typeof id === "string" && allowed.has(id))
    : [];
  const views = [...new Set([...saved, ...SIDE_PANEL_VIEWS])];
  return {
    isOpen: input.isOpen === true,
    width:
      typeof input.width === "number" && Number.isFinite(input.width)
        ? Math.max(200, Math.min(600, input.width))
        : DEFAULT_SIDE_PANEL.width,
    views,
    activeView:
      typeof input.activeView === "string" && views.includes(input.activeView)
        ? input.activeView
        : views[0],
  };
}
