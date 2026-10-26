import { createLogger } from "src/app/logger";
import type { IThread } from "src/service-container/interfaces";

const logger = createLogger("thread-list");
const STORE_NAME = "ThreadListSnapshots";
const SNAPSHOT_LIMIT = 50;

export interface ThreadListSnapshot {
  url: string;
  last_modified: string;
  last_updated: number;
  threads: IThread[];
}

export async function getThreadListSnapshots(boardUrl: string): Promise<ThreadListSnapshot[]> {
  const { platform } = await import("src/app");
  const entries = await platform.storage
    .getStore(STORE_NAME)
    .index("last_modified")
    .getAll(boardUrl);
  return (entries as ThreadListSnapshot[]).sort((a, b) => b.last_updated - a.last_updated);
}

export async function saveThreadListSnapshot(boardUrl: string, threads: IThread[]): Promise<void> {
  try {
    const { platform } = await import("src/app");
    const store = platform.storage.getStore(STORE_NAME);
    // レコードを個別に保存し、複数のタブが同時更新しても履歴を上書きしない。
    await store.put({
      url: `snapshot:${crypto.randomUUID()}`,
      last_modified: boardUrl,
      last_updated: Date.now(),
      threads,
    } satisfies ThreadListSnapshot);
    const snapshots = await getThreadListSnapshots(boardUrl);
    await Promise.all(snapshots.slice(SNAPSHOT_LIMIT).map(({ url }) => store.delete(url)));
  } catch (error) {
    logger.error("スレ一覧のスナップショットを保存できませんでした:", { boardUrl, error });
  }
}
