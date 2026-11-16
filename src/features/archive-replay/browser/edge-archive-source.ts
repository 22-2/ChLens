import { createLogger } from "src/app/logger";
import { platform } from "src/app/platform";
import { container } from "src/service-container";

import { threadKeyToEpochSeconds } from "../domain/thread-collection/collection-window";
import type { ArchivedThreadListing } from "../domain/thread-collection/types";

const ARCHIVE_ORIGIN = "https://eddiarchive3rd.boy.jp/";
const BOARD_ORIGIN = "https://bbs.eddibb.cc";
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const logger = createLogger("archive-replay");

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

export async function fetchEdgeArchiveRange(
  keyword: string,
  startSeconds: number,
  endSeconds: number,
): Promise<{ threads: ArchivedThreadListing[]; truncated: boolean }> {
  const cache = new Map<number, EdgeArchivePage>();
  let expectedTotal: number | undefined;
  async function fetchPage(page: number): Promise<EdgeArchivePage> {
    const existing = cache.get(page);
    if (existing) return existing;
    const url = new URL(ARCHIVE_ORIGIN);
    url.search = new URLSearchParams({
      page: String(page),
      keyword,
      sort: "new",
      start_date: japanDate(startSeconds),
      // 索引の終了日はその日の午前0時を含まないため、利用者が選んだ日を全て含める。
      end_date: japanDate(endSeconds + 24 * 60 * 60),
    }).toString();
    const response = await platform.http.fetch(url.href, {
      mimeType: "text/html; charset=utf-8",
      timeout: 15000,
    });
    if (response.status !== 200)
      throw new Error(`過去ログ索引の取得に失敗しました (HTTP ${response.status})`);
    const parsed = parseEdgeArchivePage(response.body);
    if (expectedTotal !== undefined && parsed.total !== expectedTotal)
      throw new Error("過去ログ索引の件数が取得中に変化しました。もう一度検索してください");
    expectedTotal = parsed.total;
    const expectedCount = Math.min(PAGE_SIZE, parsed.total - (page - 1) * PAGE_SIZE);
    if (expectedCount > 0 && parsed.threads.length !== expectedCount)
      throw new Error("過去ログ索引の一覧が途中で欠けています");
    for (let index = 1; index < parsed.threads.length; index += 1) {
      if (parsed.threads[index - 1].createdAtSeconds < parsed.threads[index].createdAtSeconds)
        throw new Error("過去ログ索引の並び順が変わりました");
    }
    for (const [cachedNumber, cached] of cache) {
      const newer = cachedNumber < page ? cached : parsed;
      const older = cachedNumber < page ? parsed : cached;
      const newerLast = newer.threads.at(-1);
      const olderFirst = older.threads[0];
      if (newerLast && olderFirst && newerLast.createdAtSeconds < olderFirst.createdAtSeconds)
        throw new Error("過去ログ索引のページ順が変わりました");
    }
    cache.set(page, parsed);
    return parsed;
  }

  const first = await fetchPage(1);
  const totalPages = Math.ceil(first.total / PAGE_SIZE);
  if (totalPages === 0) return { threads: [], truncated: false };
  // 全ページを列挙せず、最初に終了時刻以下のスレを含むページを二分探索する。
  let low = 1;
  let high = totalPages + 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const page = await fetchPage(middle);
    const last = page.threads.at(-1);
    if (last && last.createdAtSeconds <= endSeconds) high = middle;
    else low = middle + 1;
  }

  const threads: ArchivedThreadListing[] = [];
  let previousLast: number | undefined;
  for (let pageNumber = low; pageNumber <= totalPages; pageNumber += 1) {
    if (pageNumber - low >= MAX_PAGES) return { threads, truncated: true };
    const page = await fetchPage(pageNumber);
    const firstItem = page.threads[0];
    if (previousLast !== undefined && firstItem && firstItem.createdAtSeconds > previousLast)
      throw new Error("過去ログ索引のページ順が変わりました");
    for (const thread of page.threads) {
      if (thread.createdAtSeconds < startSeconds) return { threads, truncated: false };
      if (thread.createdAtSeconds <= endSeconds) threads.push(thread);
    }
    previousLast = page.threads.at(-1)?.createdAtSeconds;
  }
  return { threads, truncated: false };
}

export async function fetchEdgeArchive(
  query: string,
  startSeconds: number,
  endSeconds: number,
): Promise<{
  threads: ArchivedThreadListing[];
  matchingTruncated: boolean;
  broadTruncated: boolean;
  failures: string[];
}> {
  if (!query.trim()) throw new Error("検索語を入力してください");
  // 一覧全体だけでは新しい無関係なスレで上限に達するため、検索語一致も別に取得する。
  // 題名が変わった続きの候補は、検索語なしの一覧から補う。
  const [matching, broad] = await Promise.allSettled([
    fetchEdgeArchiveRange(query.trim(), startSeconds, endSeconds),
    fetchEdgeArchiveRange("", startSeconds, endSeconds),
  ]);
  const failures: string[] = [];
  if (matching.status === "rejected") {
    logger.error("検索語に一致する過去ログ索引の取得に失敗しました", matching.reason);
    failures.push("検索語に一致する過去ログを取得できませんでした。");
  }
  if (broad.status === "rejected") {
    logger.error("続き候補の過去ログ索引の取得に失敗しました", broad.reason);
    failures.push("続き候補の過去ログ一覧を取得できませんでした。");
  }
  return {
    threads: [
      ...(matching.status === "fulfilled" ? matching.value.threads : []),
      ...(broad.status === "fulfilled" ? broad.value.threads : []),
    ],
    matchingTruncated: matching.status === "fulfilled" && matching.value.truncated,
    broadTruncated: broad.status === "fulfilled" && broad.value.truncated,
    failures,
  };
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
