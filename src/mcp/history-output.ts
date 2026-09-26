import { encode } from "@toon-format/toon";

export interface McpWriteHistoryRecord {
  id: number;
  url: string;
  res: number;
  title: string;
  name: string;
  mail: string;
  message: string;
  date: number;
}

export interface McpBrowsingHistoryRecord {
  url: string;
  title: string;
  boardTitle: string;
  date: number;
}

export function encodeWriteHistoryForMcp(
  query: string,
  writes: readonly McpWriteHistoryRecord[],
): string {
  return encode({
    writes: writes.map((write) => ({
      id: write.id,
      url: write.url,
      res: write.res,
      title: write.title,
      name: write.name,
      mail: write.mail,
      message: write.message,
      date: new Date(write.date).toISOString(),
    })),
    query,
    count: writes.length,
  });
}

export function encodeBrowsingHistoryForMcp(
  query: string,
  history: readonly McpBrowsingHistoryRecord[],
): string {
  return encode({
    history: history.map((entry) => ({
      url: entry.url,
      title: entry.title,
      board: entry.boardTitle,
      date: new Date(entry.date).toISOString(),
    })),
    query,
    count: history.length,
  });
}
