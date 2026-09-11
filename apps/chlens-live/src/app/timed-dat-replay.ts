import { type IRes, ThreadParser } from "@chlen/ch-lib";
import type { CommentCandidate } from "src/features/comment-overlay/domain";

const POST_TIME_PATTERN =
  /(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/;

export interface TimedDatComment extends CommentCandidate {
  elapsedMilliseconds: number;
}

function parseTimestamp(date: string): number | null {
  const match = POST_TIME_PATTERN.exec(date);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = "0"] = match;
  const milliseconds = Number(fraction.padEnd(3, "0").slice(0, 3));
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    milliseconds,
  ).getTime();
}

function plainText(html: string): string {
  // 変更理由: dat本文はHTML片なので、そのまま流すと<br>や文字参照が画面へ見えてしまう。
  const document = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, "\n"), "text/html");
  return document.body.textContent?.trim() ?? "";
}

/** datの投稿日時を先頭レスからの経過時間へ直し、ポーリング再生できる形にする。 */
export function createTimedDatComments(datText: string): readonly TimedDatComment[] {
  const posts = ThreadParser.parseCh(datText).posts;
  const timedPosts = posts
    .map((post) => ({ post, timestamp: parseTimestamp(post.date) }))
    .filter((entry): entry is { post: IRes; timestamp: number } => entry.timestamp !== null);
  const startedAt = timedPosts[0]?.timestamp;
  if (startedAt === undefined) return [];

  return timedPosts.map(({ post, timestamp }) => ({
    responseNumber: post.number,
    author: plainText(post.name),
    ...(post.id ? { id: post.id } : {}),
    text: plainText(post.message),
    date: post.date,
    elapsedMilliseconds: Math.max(0, timestamp - startedAt),
  }));
}

export function commentsAvailableAt(
  comments: readonly TimedDatComment[],
  elapsedMilliseconds: number,
): readonly TimedDatComment[] {
  // 変更理由: 接続直後に全履歴を投入せず、最初のポーリングが完了するまで表示を空にする。
  if (elapsedMilliseconds <= 0) return [];
  return comments.filter((comment) => comment.elapsedMilliseconds <= elapsedMilliseconds);
}
