export function recordOpen(url: string, active = true, newWindow = false) {
  window.dispatchEvent(new CustomEvent("probe:open", { detail: { url, active, newWindow } }));
}

// 実際の外部通信だけを記録へ置換し、承認・URL解析・入力イベントは実装そのものを使う。
export const platform = {
  window: {
    openUrlInTab: async (url: string, active = true) => recordOpen(url, active),
    openWindow: async ({ url }: { url: string }) => recordOpen(url, true, true),
  },
};
