// コマンドパレットからスレッドのフィルタモードを切り替えるイベント。
// 変更理由: フィルタボタンと同じく、選択中のモードを再度選ぶと解除する挙動を
// パレットからも使えるよう、対象タブと選んだモードを明示して渡す。
export const THREAD_FILTER_MODE_TOGGLE_EVENT = "thread-filter-mode-toggle";

export interface ThreadFilterModeToggleDetail {
  tabId: string;
  filter: "popular" | "image" | "video" | "link";
}
