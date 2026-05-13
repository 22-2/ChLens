import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { getTauriDrizzleContext } from "src/app/platform/tauri/drizzle/db";
import {
  bbsMenuCacheTable,
  cacheTable,
  historyTable,
  readStateTable,
  writeHistoryTable,
} from "src/app/platform/tauri/drizzle/schema";
import { URL } from "src/core/URL";
import type { IReadState } from "src/service-container/interfaces";

interface BBSMenuCacheRecord {
  key: string;
  data: string;
  lastUpdated: number;
}

interface CacheRecordInput {
  url: string;
  data: string | null;
  parsed: unknown | null;
  lastUpdated: number;
  lastModified: number | null;
  etag: string | null;
  resLength: number | null;
  datSize: number | null;
  readcgiVer: number | null;
}

interface HistoryRecord {
  id: number;
  url: string;
  title: string;
  date: number;
  boardTitle: string;
}

interface WriteHistoryRecord {
  id: number;
  url: string;
  res: number;
  title: string;
  name: string;
  mail: string;
  input_name: string;
  input_mail: string;
  message: string;
  date: number;
}

interface UrlFilterResult {
  original: URL;
  replaced: URL;
}

function urlFilter(originalUrlStr: string): UrlFilterResult {
  const original = new URL(originalUrlStr);
  const replaced = new URL(originalUrlStr);
  if (original.hostname.endsWith(".5ch.io")) {
    replaced.hostname = "*.5ch.io";
  }

  return { original, replaced };
}

export const tauriBBSMenuCacheRepository = {
  async get(key: string): Promise<BBSMenuCacheRecord | null> {
    const { db } = await getTauriDrizzleContext();
    const rows = await db
      .select()
      .from(bbsMenuCacheTable)
      .where(eq(bbsMenuCacheTable.key, key))
      .limit(1);

    const row = rows[0];
    if (row == null) return null;

    return { key: row.key, data: row.data, lastUpdated: row.lastUpdated };
  },

  async put(record: BBSMenuCacheRecord): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db
      .insert(bbsMenuCacheTable)
      .values({
        key: record.key,
        data: record.data,
        lastUpdated: record.lastUpdated,
      })
      .onConflictDoUpdate({
        target: bbsMenuCacheTable.key,
        set: { data: record.data, lastUpdated: record.lastUpdated },
      });
  },
};

export const tauriCacheRepository = {
  async get(url: string): Promise<CacheRecordInput | null> {
    const { db } = await getTauriDrizzleContext();
    const rows = await db
      .select()
      .from(cacheTable)
      .where(eq(cacheTable.url, url))
      .limit(1);

    const row = rows[0];
    if (row == null) {
      return null;
    }

    return {
      url: row.url,
      data: row.data,
      parsed: row.parsedJson == null ? null : JSON.parse(row.parsedJson),
      lastUpdated: row.lastUpdated,
      lastModified: row.lastModified,
      etag: row.etag,
      resLength: row.resLength,
      datSize: row.datSize,
      readcgiVer: row.readcgiVer,
    };
  },

  async put(record: CacheRecordInput): Promise<void> {
    const { db } = await getTauriDrizzleContext();

    await db
      .insert(cacheTable)
      .values({
        url: record.url,
        data: record.data,
        parsedJson:
          record.parsed == null ? null : JSON.stringify(record.parsed),
        lastUpdated: record.lastUpdated,
        lastModified: record.lastModified,
        etag: record.etag,
        resLength: record.resLength,
        datSize: record.datSize,
        readcgiVer: record.readcgiVer,
      })
      .onConflictDoUpdate({
        target: cacheTable.url,
        set: {
          data: record.data,
          parsedJson:
            record.parsed == null ? null : JSON.stringify(record.parsed),
          lastUpdated: record.lastUpdated,
          lastModified: record.lastModified,
          etag: record.etag,
          resLength: record.resLength,
          datSize: record.datSize,
          readcgiVer: record.readcgiVer,
        },
      });
  },

  async remove(url: string): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db.delete(cacheTable).where(eq(cacheTable.url, url));
  },

  async clear(): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db.delete(cacheTable);
  },

  async count(): Promise<number> {
    const { db } = await getTauriDrizzleContext();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(cacheTable);
    return Number(rows[0]?.count ?? 0);
  },

  async clearOlderThan(dayUnix: number): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db.delete(cacheTable).where(lt(cacheTable.lastUpdated, dayUnix));
  },
};

export const tauriHistoryRepository = {
  async add(
    url: string,
    title: string,
    date: number,
    boardTitle: string,
  ): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db.insert(historyTable).values({ url, title, date, boardTitle });
  },

  async remove(url: string, date: number | null): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    if (date != null) {
      await db
        .delete(historyTable)
        .where(and(eq(historyTable.url, url), eq(historyTable.date, date)));
      return;
    }

    await db.delete(historyTable).where(eq(historyTable.url, url));
  },

  async get(offset: number, limit: number): Promise<HistoryRecord[]> {
    const { db } = await getTauriDrizzleContext();

    let query = db.select().from(historyTable).orderBy(desc(historyTable.date));

    if (offset >= 0) {
      query = query.offset(offset);
    }
    if (limit >= 0) {
      query = query.limit(limit);
    }

    return query;
  },

  async getUnique(offset: number, limit: number): Promise<HistoryRecord[]> {
    const chunkSize = limit >= 0 ? Math.max(limit * 2, 200) : 500;
    let currentOffset = offset >= 0 ? offset : 0;
    const unique: HistoryRecord[] = [];
    const inserted = new Set<string>();

    while (true) {
      const rows = await this.get(currentOffset, chunkSize);
      if (rows.length === 0) {
        return unique;
      }

      currentOffset += rows.length;
      for (const row of rows) {
        if (inserted.has(row.url)) {
          continue;
        }
        inserted.add(row.url);
        unique.push(row);

        if (limit >= 0 && unique.length >= limit) {
          return unique;
        }
      }

      if (rows.length < chunkSize) {
        return unique;
      }
    }
  },

  async getAll(): Promise<HistoryRecord[]> {
    const { db } = await getTauriDrizzleContext();
    return db.select().from(historyTable).orderBy(desc(historyTable.id));
  },

  async count(): Promise<number> {
    const { db } = await getTauriDrizzleContext();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(historyTable);
    return Number(rows[0]?.count ?? 0);
  },

  async clear(offset: number): Promise<void> {
    const { db, raw } = await getTauriDrizzleContext();
    if (offset < 0) {
      await db.delete(historyTable);
      return;
    }

    await raw.execute(
      "DELETE FROM history WHERE id IN (SELECT id FROM history ORDER BY id ASC LIMIT -1 OFFSET ?)",
      [offset],
    );
  },

  async clearRange(dayUnix: number): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db.delete(historyTable).where(lt(historyTable.date, dayUnix));
  },
};

export const tauriReadStateRepository = {
  async set(
    readState: IReadState,
  ): Promise<{ boardUrl: string; normalizedUrl: string }> {
    const { db } = await getTauriDrizzleContext();

    const normalized = { ...readState };
    const url = urlFilter(normalized.url);
    normalized.url = url.replaced.href;
    const boardUrl = url.original.toBoard();
    const normalizedBoardUrl = urlFilter(boardUrl.href).replaced.href;

    await db
      .insert(readStateTable)
      .values({
        url: normalized.url,
        last: normalized.last,
        read: normalized.read,
        received: normalized.received,
        offset: normalized.offset ?? null,
        date: normalized.date ?? null,
        boardUrl: normalizedBoardUrl,
      })
      .onConflictDoUpdate({
        target: readStateTable.url,
        set: {
          last: normalized.last,
          read: normalized.read,
          received: normalized.received,
          offset: normalized.offset ?? null,
          date: normalized.date ?? null,
          boardUrl: normalizedBoardUrl,
        },
      });

    return {
      boardUrl: boardUrl.href,
      normalizedUrl: url.original.href,
    };
  },

  async get(url: string): Promise<IReadState | null> {
    const { db } = await getTauriDrizzleContext();
    const filtered = urlFilter(url);
    const rows = await db
      .select()
      .from(readStateTable)
      .where(eq(readStateTable.url, filtered.replaced.href))
      .limit(1);

    const row = rows[0];
    if (row == null) {
      return null;
    }

    return {
      url: filtered.original.href,
      last: row.last,
      read: row.read,
      received: row.received,
      offset: row.offset ?? undefined,
      date: row.date ?? undefined,
    };
  },

  async getAll(): Promise<IReadState[]> {
    const { db } = await getTauriDrizzleContext();
    const rows = await db.select().from(readStateTable);
    return rows.map((row) => ({
      url: row.url,
      last: row.last,
      read: row.read,
      received: row.received,
      offset: row.offset ?? undefined,
      date: row.date ?? undefined,
    }));
  },

  async getByBoard(url: string): Promise<IReadState[]> {
    const { db } = await getTauriDrizzleContext();
    const filtered = urlFilter(url);
    const rows = await db
      .select()
      .from(readStateTable)
      .where(eq(readStateTable.boardUrl, filtered.replaced.href));

    return rows.map((row) => ({
      url: row.url.replace(filtered.replaced.origin, filtered.original.origin),
      last: row.last,
      read: row.read,
      received: row.received,
      offset: row.offset ?? undefined,
      date: row.date ?? undefined,
    }));
  },

  async remove(url: string): Promise<string> {
    const { db } = await getTauriDrizzleContext();
    const filtered = urlFilter(url);
    await db
      .delete(readStateTable)
      .where(eq(readStateTable.url, filtered.replaced.href));
    return filtered.original.href;
  },

  async clear(): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db.delete(readStateTable);
  },
};

export const tauriWriteHistoryRepository = {
  async add(record: {
    url: string;
    res: number;
    title: string;
    name: string;
    mail: string;
    inputName: string;
    inputMail: string;
    message: string;
    date: number;
  }): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db.insert(writeHistoryTable).values({
      url: record.url,
      res: record.res,
      title: record.title,
      name: record.name,
      mail: record.mail,
      inputName: record.inputName,
      inputMail: record.inputMail,
      message: record.message,
      date: record.date,
    });
  },

  async update(record: {
    id: number;
    url: string;
    res: number;
    title: string;
    name: string;
    mail: string;
    inputName: string;
    inputMail: string;
    message: string;
    date: number;
  }): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db
      .update(writeHistoryTable)
      .set({
        url: record.url,
        res: record.res,
        title: record.title,
        name: record.name,
        mail: record.mail,
        inputName: record.inputName,
        inputMail: record.inputMail,
        message: record.message,
        date: record.date,
      })
      .where(eq(writeHistoryTable.id, record.id));
  },

  async remove(url: string, res: number): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db
      .delete(writeHistoryTable)
      .where(
        and(eq(writeHistoryTable.url, url), eq(writeHistoryTable.res, res)),
      );
  },

  async get(offset: number, limit: number): Promise<WriteHistoryRecord[]> {
    const { db } = await getTauriDrizzleContext();
    let query = db
      .select({
        id: writeHistoryTable.id,
        url: writeHistoryTable.url,
        res: writeHistoryTable.res,
        title: writeHistoryTable.title,
        name: writeHistoryTable.name,
        mail: writeHistoryTable.mail,
        input_name: writeHistoryTable.inputName,
        input_mail: writeHistoryTable.inputMail,
        message: writeHistoryTable.message,
        date: writeHistoryTable.date,
      })
      .from(writeHistoryTable)
      .orderBy(desc(writeHistoryTable.date));

    if (offset >= 0) {
      query = query.offset(offset);
    }
    if (limit >= 0) {
      query = query.limit(limit);
    }

    return query;
  },

  async getByUrl(url: string): Promise<WriteHistoryRecord[]> {
    const { db } = await getTauriDrizzleContext();
    return db
      .select({
        id: writeHistoryTable.id,
        url: writeHistoryTable.url,
        res: writeHistoryTable.res,
        title: writeHistoryTable.title,
        name: writeHistoryTable.name,
        mail: writeHistoryTable.mail,
        input_name: writeHistoryTable.inputName,
        input_mail: writeHistoryTable.inputMail,
        message: writeHistoryTable.message,
        date: writeHistoryTable.date,
      })
      .from(writeHistoryTable)
      .where(eq(writeHistoryTable.url, url))
      .orderBy(asc(writeHistoryTable.id));
  },

  async getAll(): Promise<WriteHistoryRecord[]> {
    const { db } = await getTauriDrizzleContext();
    return db
      .select({
        id: writeHistoryTable.id,
        url: writeHistoryTable.url,
        res: writeHistoryTable.res,
        title: writeHistoryTable.title,
        name: writeHistoryTable.name,
        mail: writeHistoryTable.mail,
        input_name: writeHistoryTable.inputName,
        input_mail: writeHistoryTable.inputMail,
        message: writeHistoryTable.message,
        date: writeHistoryTable.date,
      })
      .from(writeHistoryTable)
      .orderBy(desc(writeHistoryTable.id));
  },

  async count(): Promise<number> {
    const { db } = await getTauriDrizzleContext();
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(writeHistoryTable);
    return Number(rows[0]?.count ?? 0);
  },

  async clear(offset: number): Promise<void> {
    const { db, raw } = await getTauriDrizzleContext();
    if (offset < 0) {
      await db.delete(writeHistoryTable);
      return;
    }

    await raw.execute(
      "DELETE FROM write_history WHERE id IN (SELECT id FROM write_history ORDER BY id ASC LIMIT -1 OFFSET ?)",
      [offset],
    );
  },

  async clearRange(dayUnix: number): Promise<void> {
    const { db } = await getTauriDrizzleContext();
    await db
      .delete(writeHistoryTable)
      .where(lt(writeHistoryTable.date, dayUnix));
  },
};
