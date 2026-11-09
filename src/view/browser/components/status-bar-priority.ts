// ステータスバーの並び順を一元管理し、各コンポーネントのpriority直書きを避ける。
// 項目はすべて右側に置き、値の小さい項目ほど左に並ぶ。書き込みの切り替えは右端に置く。
export const STATUS_BAR_PRIORITY = {
  right: {
    commentOverlay: -5,
    autoRefresh: 0,
    ikioi: 10,
    popularFilter: 12,
    pageCount: 20,
    ng: 25,
    operation: 10,
    writePanelToggle: 100,
  },
} as const;
