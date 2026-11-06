// ステータスバーの並び順を左右で一元管理し、各コンポーネントのpriority直書きを避ける。
export const STATUS_BAR_PRIORITY = {
  left: {
    commentOverlay: -5,
    autoRefresh: 0,
    ikioi: 10,
    popularFilter: 12,
    pageCount: 20,
    ng: 25,
  },
  right: {
    writePanelToggle: 0,
    threadListLoaded: 2,
    threadListPanelToggle: 5,
    operation: 10,
  },
} as const;
