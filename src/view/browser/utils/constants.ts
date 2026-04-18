export const MAX_TREE_DEPTH = 10;
export const ANCHOR_PREVIEW_OFFSET = 12;
export const ANCHOR_PREVIEW_GUTTER = 16;
export const ANCHOR_PREVIEW_MAX_WIDTH = 560;
export const ANCHOR_PREVIEW_HIDE_DELAY_MS = 120;
export const ANCHOR_SELECTOR = "a.anchor, a.name_anchor";

// ポップアップ系のz-index基準値
// クリックで開く系（ResPopup, TreePopup）: POPUP_BASE_Z + stack順
// ホバーで開く系（AnchorPreview）: ANCHOR_PREVIEW_BASE_Z + depth（常にポップアップより前面）
export const POPUP_BASE_Z = 10020;
export const ANCHOR_PREVIEW_BASE_Z = POPUP_BASE_Z + 100; // 10120
