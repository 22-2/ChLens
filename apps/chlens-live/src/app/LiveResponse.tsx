import type { IRes } from "@chlen/ch-lib";
import type { ReactElement } from "react";

interface LiveResponseProps {
  post: IRes;
}

/**
 * Liveの取得済みレスを、ChLensのレス行と同じ余白・情報配置で表示する。
 * 取得やNG判定はLive側の責務として残し、表示だけを移植するための境界にする。
 */
export function LiveResponse({ post }: LiveResponseProps): ReactElement {
  return (
    <article className="res live-response" data-res-num={post.number}>
      <header className="res__header">
        <span className="res__num">{post.number}</span>
        <span className="res__name">{post.name}</span>
        {post.mail && <span className="res__mail">{post.mail}</span>}
        {post.id && <span className="res__id">ID:{post.id}</span>}
        <span className="res__date">{post.date || post.other}</span>
      </header>
      <div className="res__body live-response__body">
        {post.message.split("\n").map((line, index) => (
          <span key={`${post.number}-${index}`}>
            {line}
            <br />
          </span>
        ))}
      </div>
    </article>
  );
}
