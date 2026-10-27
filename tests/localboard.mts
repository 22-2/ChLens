import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import iconv from "iconv-lite";

import {
  createLargeThreadPost,
  createLargeThreadPosts,
  LARGE_THREAD_ID,
  LARGE_THREAD_TITLE,
  TINY_PNG,
} from "./large-thread.mjs";

interface LocalThread {
  id: string;
  title: string;
  posts: string[];
}

/** 実際の通信とShift_JIS変換を通しつつ、外部掲示板に依存しない板を起動する。 */
export async function startLocalBoard() {
  const threads: LocalThread[] = [
    {
      id: "1000000001",
      title: "ローカルテストスレッド",
      posts: [
        "名無し<>sage<>2026/10/02(金) 12:00:00 ID:local001<>最初の日本語レス<>ローカルテストスレッド",
        "テスト住民<>sage<>2026/10/02(金) 12:01:00 ID:local002<>二番目の日本語レス<>ローカルテストスレッド",
      ],
    },
  ];
  const requests: string[] = [];
  const requestMethods: string[] = [];
  const hiddenSubjectThreadIds = new Set<string>();
  const imageContentLengthOverrides = new Map<string, number | null>();
  const imageHeadStatusOverrides = new Map<string, number>();
  const imageBodies = new Map<string, { body: Uint8Array; contentType: string }>();
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    requests.push(pathname);
    requestMethods.push(request.method ?? "GET");
    if (/^\/img\/\d+\.png$/u.test(pathname)) {
      // 実画像は小さい固定PNGを使い、HEADのサイズだけ境界値へ調整して事前警告を検証する。
      // 類似画像NGのように画像の中身が要る検証では、setImageBodyで差し替える。
      const customImage = imageBodies.get(pathname);
      const imageBody = customImage?.body ?? TINY_PNG;
      const headStatus = imageHeadStatusOverrides.get(pathname) ?? 200;
      const headers: Record<string, string> = {
        "Content-Type": customImage?.contentType ?? "image/png",
        "Cache-Control": "no-store",
      };
      const contentLength = imageContentLengthOverrides.has(pathname)
        ? imageContentLengthOverrides.get(pathname)
        : imageBody.byteLength;
      if (request.method === "HEAD" && contentLength != null) {
        headers["Content-Length"] = String(contentLength);
      }
      response.writeHead(request.method === "HEAD" ? headStatus : 200, headers);
      response.end(request.method === "HEAD" ? undefined : imageBody);
      return;
    }
    const resources: Record<string, string> = {
      "/bbsmenu.html":
        '<html><head><title>テスト板メニュー</title></head><body>\n<br><br><b>テストカテゴリ</b><br>\n<a href="/local/">ローカルテスト板</a><br>\n</body></html>',
      "/local/SETTING.TXT": "BBS_TITLE=ローカルテスト板\n",
      "/local/subject.txt": `${threads
        .filter((thread) => !hiddenSubjectThreadIds.has(thread.id))
        .map((thread) => `${thread.id}.dat<>${thread.title} (${thread.posts.length})`)
        .join("\n")}\n`,
    };
    const datMatch = pathname.match(/^\/local\/dat\/(\d+)\.dat$/u);
    const datThread =
      datMatch == null ? undefined : threads.find((item) => item.id === datMatch[1]);
    const body = datThread == null ? resources[pathname] : `${datThread.posts.join("\n")}\n`;
    if (body === undefined) {
      console.error(`[localboard] 未対応のリクエスト: ${request.method} ${request.url}`);
      response.writeHead(404).end();
      return;
    }
    // 更新時も全体を200で返し、クライアント側のレス統合と重複防止を確認できるようにする。
    response.writeHead(200, {
      "Content-Type": `${pathname.endsWith(".html") ? "text/html" : "text/plain"}; charset=Shift_JIS`,
      "Cache-Control": "no-store",
    });
    response.end(iconv.encode(body, "Shift_JIS"));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // 空きポートをテスト単位で割り当て、並列実行時のポート競合を防ぐ。
    server.listen(0, "127.0.0.1", resolve);
  });
  server.on("error", (error) => console.error("[localboard] サーバーエラー", error));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    boardUrl: `${origin}/local/`,
    threadUrl: `${origin}/test/read.cgi/local/1000000001/`,
    requests,
    requestMethods,
    setDat(source: string, threadId = threads[0]!.id) {
      // 添付DATの再現でも、外部掲示板へ通信せず同じ文字コード・取得経路を通す。
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) throw new Error(`未登録のローカルスレッドです: ${threadId}`);
      thread.posts.splice(0, thread.posts.length, ...source.trimEnd().split(/\r?\n/u));
    },
    setThreads(nextThreads: LocalThread[]) {
      // スクショ用の架空スレ一覧をテストごとに差し替えられるようにする。
      threads.splice(
        0,
        threads.length,
        ...nextThreads.map((thread) => ({ ...thread, posts: [...thread.posts] })),
      );
      hiddenSubjectThreadIds.clear();
    },
    setThreadSubjectVisible(threadId: string, visible: boolean) {
      if (visible) hiddenSubjectThreadIds.delete(threadId);
      else hiddenSubjectThreadIds.add(threadId);
    },
    setImageContentLength(imageNumber: number, contentLength: number | null) {
      imageContentLengthOverrides.set(`/img/${imageNumber}.png`, contentLength);
    },
    setImageBody(imageNumber: number, body: Uint8Array, contentType: string) {
      imageBodies.set(`/img/${imageNumber}.png`, { body, contentType });
    },
    setImageHeadStatus(imageNumber: number, status: number | null) {
      const pathname = `/img/${imageNumber}.png`;
      if (status == null) imageHeadStatusOverrides.delete(pathname);
      else imageHeadStatusOverrides.set(pathname, status);
    },
    appendPost(threadId = threads[0]!.id) {
      const thread = threads.find((item) => item.id === threadId);
      if (!thread) throw new Error(`未登録のローカルスレッドです: ${threadId}`);
      const nextNumber = thread.posts.length + 1;
      thread.posts.push(
        `追加住民<>sage<>2026/10/02(金) 12:02:00 ID:local${String(nextNumber).padStart(3, "0")}<>更新で追加された日本語レス #${nextNumber}<>`,
      );
    },
    /** 仮想スクロールの検証用に、高さの違うレスを含む大きなスレッドを板へ追加する。 */
    addLargeThread(count: number, { id = LARGE_THREAD_ID, title = LARGE_THREAD_TITLE } = {}) {
      // 性能計測では同じ形のスレを複数のタブで開くため、IDとタイトルだけを変えて追加できるようにする。
      threads.push({ id, title, posts: createLargeThreadPosts(count, origin, title) });
      return { threadId: id, title, threadUrl: `${origin}/test/read.cgi/local/${id}/` };
    },
    appendLargeThreadPosts(count: number) {
      const thread = threads.find((item) => item.id === LARGE_THREAD_ID);
      if (!thread) throw new Error("大きなスレッドがまだ追加されていません");
      for (let index = 0; index < count; index++) {
        thread.posts.push(createLargeThreadPost(thread.posts.length + 1, origin));
      }
    },
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
