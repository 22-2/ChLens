import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cacheTable = sqliteTable(
  "cache",
  {
    url: text("url").primaryKey(),
    data: text("data"),
    parsedJson: text("parsed_json"),
    lastUpdated: integer("last_updated").notNull(),
    lastModified: integer("last_modified"),
    etag: text("etag"),
    resLength: integer("res_length"),
    datSize: integer("dat_size"),
    readcgiVer: integer("readcgi_ver"),
    // 閲覧ログ機能用のメタ情報。kind="thread" のスレキャッシュのみログ一覧の対象。
    // url(主キー)は dat パスのため、スレを再表示するための read.cgi 形式 URL を別途持つ。
    title: text("title"),
    threadUrl: text("thread_url"),
    boardUrl: text("board_url"),
    boardTitle: text("board_title"),
    kind: text("kind"),
  },
  (table) => [
    index("idx_cache_last_updated").on(table.lastUpdated),
    index("idx_cache_last_modified").on(table.lastModified),
    index("idx_cache_kind").on(table.kind),
  ],
);

export const historyTable = sqliteTable(
  "history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    date: integer("date").notNull(),
    boardTitle: text("board_title").notNull(),
  },
  (table) => [
    index("idx_history_url").on(table.url),
    index("idx_history_title").on(table.title),
    index("idx_history_date").on(table.date),
  ],
);

export const readStateTable = sqliteTable(
  "read_state",
  {
    url: text("url").primaryKey(),
    last: integer("last").notNull(),
    read: integer("read").notNull(),
    received: integer("received").notNull(),
    offset: integer("offset"),
    date: integer("date"),
    boardUrl: text("board_url").notNull(),
  },
  (table) => [index("idx_read_state_board_url").on(table.boardUrl)],
);

export const bbsMenuCacheTable = sqliteTable("bbsmenu_cache", {
  key: text("key").primaryKey(),
  data: text("data").notNull(),
  lastUpdated: integer("last_updated").notNull(),
});

export const writeHistoryTable = sqliteTable(
  "write_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    res: integer("res").notNull(),
    title: text("title").notNull(),
    name: text("name").notNull(),
    mail: text("mail").notNull(),
    inputName: text("input_name").notNull(),
    inputMail: text("input_mail").notNull(),
    message: text("message").notNull(),
    date: integer("date").notNull(),
  },
  (table) => [
    index("idx_write_history_url").on(table.url),
    index("idx_write_history_res").on(table.res),
    index("idx_write_history_title").on(table.title),
    index("idx_write_history_date").on(table.date),
  ],
);
