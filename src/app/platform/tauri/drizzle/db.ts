import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";

interface SqlPluginDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
}

type ProxyMethod = "run" | "all" | "get" | "values";

interface TauriDrizzleContext {
  db: ReturnType<typeof drizzle>;
  raw: SqlPluginDatabase;
}

let dbContextPromise: Promise<TauriDrizzleContext> | null = null;

async function runMigrations(raw: SqlPluginDatabase): Promise<void> {
  await raw.execute(`
    CREATE TABLE IF NOT EXISTS cache (
      url TEXT PRIMARY KEY,
      data TEXT,
      parsed_json TEXT,
      last_updated INTEGER NOT NULL,
      last_modified INTEGER,
      etag TEXT,
      res_length INTEGER,
      dat_size INTEGER,
      readcgi_ver INTEGER
    )
  `);
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_cache_last_updated ON cache(last_updated)",
  );
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_cache_last_modified ON cache(last_modified)",
  );

  await raw.execute(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      date INTEGER NOT NULL,
      board_title TEXT NOT NULL
    )
  `);
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_history_url ON history(url)",
  );
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_history_title ON history(title)",
  );
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_history_date ON history(date)",
  );

  await raw.execute(`
    CREATE TABLE IF NOT EXISTS read_state (
      url TEXT PRIMARY KEY,
      last INTEGER NOT NULL,
      read INTEGER NOT NULL,
      received INTEGER NOT NULL,
      offset INTEGER,
      date INTEGER,
      board_url TEXT NOT NULL
    )
  `);
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_read_state_board_url ON read_state(board_url)",
  );

  await raw.execute(`
    CREATE TABLE IF NOT EXISTS write_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      res INTEGER NOT NULL,
      title TEXT NOT NULL,
      name TEXT NOT NULL,
      mail TEXT NOT NULL,
      input_name TEXT NOT NULL,
      input_mail TEXT NOT NULL,
      message TEXT NOT NULL,
      date INTEGER NOT NULL
    )
  `);
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_write_history_url ON write_history(url)",
  );
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_write_history_res ON write_history(res)",
  );
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_write_history_title ON write_history(title)",
  );
  await raw.execute(
    "CREATE INDEX IF NOT EXISTS idx_write_history_date ON write_history(date)",
  );
}

async function createContext(): Promise<TauriDrizzleContext> {
  const raw = (await Database.load("sqlite:chlens.db")) as SqlPluginDatabase;

  await runMigrations(raw);

  const db = drizzle(async (query, params, method) => {
    const bindValues = (params ?? []) as unknown[];
    if ((method as ProxyMethod) === "run") {
      await raw.execute(query, bindValues);
      return { rows: [] };
    }

    const rows = await raw.select<Record<string, unknown>>(query, bindValues);
    return { rows };
  });

  return { db, raw };
}

export async function getTauriDrizzleContext(): Promise<TauriDrizzleContext> {
  if (dbContextPromise == null) {
    dbContextPromise = createContext();
  }
  return dbContextPromise;
}
