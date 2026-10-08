import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import iconv from "iconv-lite";

// 実際の通信と文字コード変換を通しつつ、外部掲示板の状態に左右されないデータを配信する。
export async function startLocalBoard() {
  const posts = [
    "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>最初の日本語レス<>ローカルテストスレッド",
    "テスト住民<>sage<>2026/10/02(金) 12:01:00 ID:local002<>二番目の日本語レス<>",
  ];
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    requests.push(pathname);
    const resources: Record<string, string> = {
      "/bbsmenu.html":
        '<html><head><title>テスト板メニュー</title></head><body>\n<br><br><b>テストカテゴリ</b><br>\n<a href="/local/">ローカルテスト板</a><br>\n</body></html>',
      "/local/SETTING.TXT": "BBS_TITLE=ローカルテスト板\n",
      "/local/subject.txt": `1000000001.dat<>ローカルテストスレッド (${posts.length})\n`,
      "/local/dat/1000000001.dat": `${posts.join("\n")}\n`,
    };
    const body = resources[pathname];
    if (body === undefined) {
      console.error(`[localboard] 未対応のリクエスト: ${request.method} ${request.url}`);
      response.writeHead(404).end();
      return;
    }
    // 更新時も全体を200で返し、クライアントの既存レスとの統合と重複防止を検証する。
    response.writeHead(200, {
      "Content-Type": `${pathname.endsWith(".html") ? "text/html" : "text/plain"}; charset=Shift_JIS`,
      "Cache-Control": "no-store",
    });
    response.end(iconv.encode(body, "Shift_JIS"));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // 空きポートをテスト単位で割り当て、並列実行時のデータ混入とポート競合を防ぐ。
    server.listen(0, "127.0.0.1", resolve);
  });
  server.on("error", (error) => console.error("[localboard] サーバーエラー", error));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    boardUrl: `${origin}/local/`,
    threadUrl: `${origin}/test/read.cgi/local/1000000001/`,
    requests,
    setDat(source: string) {
      // 添付DATの再現でも、外部掲示板へ通信せず同じ文字コード・取得経路を通す。
      posts.splice(0, posts.length, ...source.trimEnd().split(/\r?\n/u));
    },
    appendPost() {
      posts.push(
        "追加住民<>sage<>2026/10/02(金) 12:02:00 ID:local003<>更新で追加された日本語レス<>",
      );
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
