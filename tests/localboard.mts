import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { serve } from "@hono/node-server";
import { Hono } from "hono";

import {
  createLargeThreadPost,
  createLargeThreadPosts,
  LARGE_THREAD_ID,
  LARGE_THREAD_TITLE,
} from "./large-thread.mjs";
import { createBoardRoutes, type LocalThread } from "./localboard/board-routes.mjs";
import { createWriteRoutes } from "./localboard/write-routes.mjs";

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
  let edgeAuthEnabled = false;
  let responseLimit: number | null = null;
  const edgeWriteAttempts: { mail: string; message: string }[] = [];
  const requests: string[] = [];
  const requestMethods: string[] = [];
  const hiddenSubjectThreadIds = new Set<string>();
  const imageContentLengthOverrides = new Map<string, number | null>();
  const imageHeadStatusOverrides = new Map<string, number>();
  const imageBodies = new Map<string, { body: Uint8Array; contentType: string }>();
  const app = new Hono();
  app.use("*", async (c, next) => {
    requests.push(c.req.path);
    requestMethods.push(c.req.method);
    await next();
  });
  app.get("/favicon.ico", (c) => c.body(null, 204));
  app.route(
    "/",
    createWriteRoutes({
      enabled: () => edgeAuthEnabled,
      attempts: edgeWriteAttempts,
      append: (message) =>
        threads[0]!.posts.push(`名無し<>sage<>2026/10/02(金) 12:02:00 ID:local003<>${message}<>`),
    }),
  );
  app.route(
    "/",
    createBoardRoutes({
      threads,
      getResponseLimit: () => responseLimit,
      hiddenSubjectThreadIds,
      imageContentLengthOverrides,
      imageHeadStatusOverrides,
      imageBodies,
    }),
  );
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }) as Server;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
  });
  server.on("error", (error) => console.error("[localboard] サーバーエラー", error));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    boardUrl: `${origin}/local/`,
    threadUrl: `${origin}/test/read.cgi/local/1000000001/`,
    requests,
    requestMethods,
    edgeWriteAttempts,
    setResponseLimit(value: number | null) {
      responseLimit = value;
    },
    enableEdgeAuth() {
      edgeAuthEnabled = true;
    },
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
