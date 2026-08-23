import type { IRes, ThreadData } from "@chlen/ch-lib";
import { useEffect, useRef } from "react";

export interface ThreadViewProps {
  title: string | undefined;
  posts: IRes[];
  loading: boolean;
  error: unknown;
  datFall: boolean;
  onRefresh: () => void;
  onStop: () => void;
}

function formatPostHeader(post: IRes): string {
  const parts = [post.name];
  if (post.mail) parts.push(post.mail);
  if (post.date) parts.push(post.date);
  if (post.id) parts.push(`ID:${post.id}`);
  return parts.filter(Boolean).join(" ");
}

/**
 * スレ本文（datのレス列）を表示するThread UI。
 *
 * Phase 2ではLiveThreadSessionのsnapshotをそのまま描画するだけに留め、
 * NG・フィルタ・アンカー跳びなどの製品仕様は後続phaseへ委ねる。
 * 新着追従のため、postsが更新されたら末尾へ自動スクロールする。
 */
export function ThreadView({
  title,
  posts,
  loading,
  error,
  datFall,
  onRefresh,
  onStop,
}: ThreadViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    // 新規レスが追加された時だけ末尾へ追従する。初回マウントや再選択でも自然に動く。
    if (posts.length > lastCountRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    lastCountRef.current = posts.length;
  }, [posts]);

  if (error) {
    return (
      <div className="thread-view__error" role="alert">
        スレの取得に失敗しました
        <button type="button" onClick={onRefresh}>
          再試行
        </button>
      </div>
    );
  }

  return (
    <div className="thread-view">
      <header className="thread-view__header">
        <h3 className="thread-view__title">{title ?? "読み込み中…"}</h3>
        <div className="thread-view__actions">
          {datFall && <span className="thread-view__dat-fall">dat落ち</span>}
          <button type="button" onClick={onRefresh} disabled={loading}>
            更新
          </button>
          <button type="button" onClick={onStop}>
            停止
          </button>
        </div>
      </header>
      <ol className="thread-view__posts" aria-label="レス一覧">
        {posts.map((post) => (
          <li key={post.number} className="thread-view__post">
            <div className="thread-view__post-header">
              <span className="thread-view__post-number">{post.number}</span>
              <span className="thread-view__post-name">{formatPostHeader(post)}</span>
            </div>
            <div className="thread-view__post-message">
              {post.message.split("\n").map((line, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <span key={index} className="thread-view__post-line">
                  {line}
                  <br />
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div ref={bottomRef} />
    </div>
  );
}

export function threadPosts(data: ThreadData): IRes[] {
  return data.posts;
}
