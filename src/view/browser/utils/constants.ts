export const MAX_TREE_DEPTH = 10;
export const ANCHOR_PREVIEW_OFFSET = 12;
export const ANCHOR_PREVIEW_GUTTER = 16;
export const ANCHOR_PREVIEW_MAX_WIDTH = 560;
export const ANCHOR_PREVIEW_HIDE_DELAY_MS = 120;
export const ANCHOR_SELECTOR = "a.anchor, a.name_anchor";
export const ID_LINK_SELECTOR = "a.anchor_id";
// ポータルや別レイヤーへ出した子メニューでも同じ「ポップアップ面」として扱い、
// 親ポップアップの外側クリック判定が子要素で誤反応しないようにする。
export const POPUP_SURFACE_SELECTOR = "[data-popup-surface='true']";
export const POPUP_SURFACE_ID_ATTRIBUTE = "data-popup-id";

// ポップアップ系のz-index基準値
// クリックで開く系（ResPopup, TreePopup）: POPUP_BASE_Z + stack順
// ホバーで開く系（AnchorPreview）: ANCHOR_PREVIEW_BASE_Z + depth（常にポップアップより前面）
export const POPUP_BASE_Z = 10020;
export const ANCHOR_PREVIEW_BASE_Z = POPUP_BASE_Z + 100; // 10120
