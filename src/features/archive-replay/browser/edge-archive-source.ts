import { platform } from "src/app/platform";
import { container } from "src/service-container";

import { threadKeyToEpochSeconds } from "../domain/thread-collection/collection-window";
import type { ArchivedThreadListing } from "../domain/thread-collection/types";

const ARCHIVE_ORIGIN = "https://eddiarchive3rd.boy.jp/";
const BOARD_ORIGIN = "https://bbs.eddibb.cc";
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

export interface EdgeArchivePage {
  threads: ArchivedThreadListing[];
  total: number;
}

export function parseEdgeArchivePage(html: string): EdgeArchivePage {
  const document = new DOMParser().parseFromString(html, "text/html");
  const container = document.querySelector("#threadContainer");
  const count = /検索結果[：:\s]*([\d,]+)件/.exec(
    document.querySelector("#result")?.textContent ?? "",
  );
  if (!container || !count) throw new Error("過去ログ索引の応答形式を解析できませんでした");
  const total = Number(count[1].replaceAll(",", ""));
  const threads = Array.from(container.querySelectorAll(".thread"), (element) => {
    const anchor = element.querySelector<HTMLAnchorElement>("a.title");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href) throw new Error("過去ログ索引にスレッドURLがありません");
    const url = new URL(href, BOARD_ORIGIN);
    const match = /^\/test\/read\.cgi\/liveedge\/(\d+)\/?$/.exec(url.pathname);
    if (url.origin !== BOARD_ORIGIN || !match)
      throw new Error("過去ログ索引に対応外のURLがあります");
    const createdAtSeconds = threadKeyToEpochSeconds(match[1]);
    if (createdAtSeconds === null) throw new Error("過去ログ索引のスレキーが不正です");
    const text = anchor.textContent?.trim() ?? "";
    const suffix = /\s+\((\d+)\)$/.exec(text);
    if (!text) throw new Error("過去ログ索引にタイトルがありません");
    return {
      threadUrl: `${BOARD_ORIGIN}/test/read.cgi/liveedge/${match[1]}/`,
      title: suffix ? text.slice(0, suffix.index).trim() : text,
      createdAtSeconds,
      ...(suffix ? { responseCount: Number(suffix[1]) } : {}),
    };
  });
  return { threads, total };
}

function japanDate(seconds: number): string {
  return new Date(seconds * 1000 + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function fetchEdgeArchive(
  query: string,
  startSeconds: number,
  endSeconds: number,
): Promise<{ threads: ArchivedThreadListing[]; truncated: boolean }> {
  if (!query.trim()) throw new Error("検索語を入力してください");
  const threads: ArchivedThreadListing[] = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(ARCHIVE_ORIGIN);
    url.search = new URLSearchParams({
      page: String(page),
      keyword: query.trim(),
      sort: "new",
      start_date: japanDate(startSeconds),
      end_date: japanDate(endSeconds),
    }).toString();
    const response = await platform.http.fetch(url.href, {
      mimeType: "text/html; charset=utf-8",
      timeout: 15000,
    });
    if (response.status !== 200)
      throw new Error(`過去ログ索引の取得に失敗しました (HTTP ${response.status})`);
    const parsed = parseEdgeArchivePage(response.body);
    total = parsed.total;
    if (!parsed.threads.length && (page - 1) * PAGE_SIZE < total)
      throw new Error("過去ログ索引の一覧が途中で欠けています");
    threads.push(...parsed.threads);
    if (page * PAGE_SIZE >= total) break;
  }
  return { threads, truncated: threads.length < total };
}

export async function fetchEdgeCurrentThreads(): Promise<ArchivedThreadListing[]> {
  const result = await container.board.getThreads(`${BOARD_ORIGIN}/liveedge/`);
  if (result.message && result.threads.length === 0) throw new Error(result.message);
  return result.threads.flatMap((thread) => {
    const key = /\/test\/read\.cgi\/liveedge\/(\d+)/.exec(thread.url)?.[1];
    const createdAtSeconds = key ? threadKeyToEpochSeconds(key) : null;
    return createdAtSeconds === null
      ? []
      : [
          {
            threadUrl: thread.url,
            title: thread.title,
            createdAtSeconds,
            responseCount: thread.resCount,
          },
        ];
  });
}
