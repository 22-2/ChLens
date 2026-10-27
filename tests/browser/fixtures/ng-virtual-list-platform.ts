// レスの画像表示は platform を読み込むが、この検証画面では外部通信も窓の操作も使わない。
// 実際の platform は拡張機能 API を要求して画面が開かなくなるため、呼ばれたら分かる差し替えにする。
function unexpected(name: string): never {
  throw new Error(`NG仮想リストの検証画面では ${name} を使いません`);
}

export const platform = {
  http: {
    fetch: async (url: string) => {
      if (!url.endsWith("/2/status/1234567890123456789")) return unexpected("platform.http.fetch");
      // 取得中の仮表示と取得後の高さを別々に計測させる。
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        status: 200,
        body: JSON.stringify({
          code: 200,
          status: {
            type: "status",
            id: "1234567890123456789",
            text: "投稿本文".repeat(100),
            author: { name: "投稿者", screen_name: "example" },
          },
        }),
      };
    },
  },
  window: { openUrlInTab: async () => unexpected("platform.window.openUrlInTab") },
};
