// レスの画像表示は platform を読み込むが、この検証画面では外部通信も窓の操作も使わない。
// 実際の platform は拡張機能 API を要求して画面が開かなくなるため、呼ばれたら分かる差し替えにする。
function unexpected(name: string): never {
  throw new Error(`NG仮想リストの検証画面では ${name} を使いません`);
}

export const platform = {
  http: { fetch: async () => unexpected("platform.http.fetch") },
  window: { openUrlInTab: async () => unexpected("platform.window.openUrlInTab") },
};
