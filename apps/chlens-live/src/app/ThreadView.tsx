import type { IRes, ThreadData } from "@chlen/ch-lib";
import { RotateCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { LiveResponse } from "./LiveResponse";

export interface ThreadViewProps {
  posts: IRes[];
  error: unknown;
  onRefresh: () => void;
}

/**
 * スレ本文（datのレス列）を表示するThread UI。
 *
 * Phase 2ではLiveThreadSessionのsnapshotをそのまま描画するだけに留め、
 * NG・フィルタ・アンカー跳びなどの製品仕様は後続phaseへ委ねる。
 * 新着追従のため、postsが更新されたら末尾へ自動スクロールする。
 */
export function ThreadView({ posts, error, onRefresh }: ThreadViewProps) {
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
        <button type="button" aria-label="再試行" title="再試行" onClick={onRefresh}>
          <RotateCw size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="thread-page live-thread-view">
      <div className="thread-page__responses" aria-label="レス一覧">
        {posts.map((post) => (
          <LiveResponse key={post.number} post={post} />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

export function threadPosts(data: ThreadData): IRes[] {
  return data.posts;
}
