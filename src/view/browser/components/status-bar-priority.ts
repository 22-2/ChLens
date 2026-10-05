// ステータスバーの並び順を左右で一元管理し、各コンポーネントのpriority直書きを避ける。
export const STATUS_BAR_PRIORITY = {
  left: {
    autoRefresh: 0,
    ng: 5,
    ikioi: 10,
    popularFilter: 12,
    pageCount: 20,
    commentOverlay: 25,
  },
  right: {
    writePanelToggle: 0,
    threadListPanelToggle: 5,
    operation: 10,
  },
} as const;
