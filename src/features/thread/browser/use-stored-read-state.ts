import { normalizeReadStateUrl } from "@chlen/chlib";
import { useEffect, useState } from "react";
import { createLogger } from "src/app/logger";
import { container } from "src/service-container/index";
import type { IReadState } from "src/service-container/interfaces";

const logger = createLogger("thread");

/**
 * 表示中のスレの既読状態を読み、保存のたびに追従する。
 * 保存先によって URL の正規化が異なるため、履歴と同じ規則で比較する。
 */
export function useStoredReadState(threadUrl: string): IReadState | null {
  const [state, setState] = useState<{ url: string; readState: IReadState | null }>({
    url: threadUrl,
    readState: null,
  });

  useEffect(() => {
    let cancelled = false;
    const key = normalizeReadStateUrl(threadUrl);
    const isTarget = (url: string | undefined) => url != null && normalizeReadStateUrl(url) === key;
    container.readState
      .get(threadUrl)
      .then((readState) => {
        if (!cancelled) setState({ url: threadUrl, readState: readState ?? null });
      })
      .catch((error: unknown) => {
        logger.error("既読状態を取得できませんでした", { threadUrl, error });
      });
    const handleUpdated = ({ read_state: readState }: { read_state?: IReadState }) => {
      if (readState && isTarget(readState.url)) setState({ url: threadUrl, readState });
    };
    const handleRemoved = ({ url }: { url?: string }) => {
      if (isTarget(url)) setState({ url: threadUrl, readState: null });
    };
    container.message.on("read_state_updated", handleUpdated);
    container.message.on("read_state_removed", handleRemoved);
    return () => {
      cancelled = true;
      container.message.off("read_state_updated", handleUpdated);
      container.message.off("read_state_removed", handleRemoved);
    };
  }, [threadUrl]);

  // 対象が切り替わった直後に前のスレの既読状態を使わない。
  return state.url === threadUrl ? state.readState : null;
}
