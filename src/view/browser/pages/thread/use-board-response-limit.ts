import { useEffect, useState } from "react";
import { createLogger } from "src/app/logger";
import { container } from "src/service-container/index";

const logger = createLogger("view/browser");

/** 板の切替直後は古い上限を使わず、取得できるまでは上限不明として扱う。 */
export function useBoardResponseLimit(threadUrl: string): number | null {
  const [state, setState] = useState<{ url: string; limit: number | null }>({
    url: "",
    limit: null,
  });
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const limit = await container.boardResponseLimit.get(threadUrl);
        if (active) setState({ url: threadUrl, limit });
      } catch (error) {
        logger.error("板のレス上限の読み込みに失敗しました", { threadUrl, error });
        if (active) setState({ url: threadUrl, limit: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [threadUrl]);
  return state.url === threadUrl ? state.limit : null;
}
