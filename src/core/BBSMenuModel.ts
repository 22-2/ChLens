import Callbacks from "src/app/Callbacks";
import { BBSMenu } from "src/core/BBSMenuParser";
import * as History from "src/core/History";
import { URL } from "src/core/URL";
import { container } from "src/service-container/index";
// @ts-ignore
import { BBSMenuFetcher } from "src/core/BBSMenuFetcher";
import { BBSMenuParser } from "src/core/BBSMenuParser";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";
import { OtherBoardsCollector } from "src/core/OtherBoardsCollector";
import * as ReadState from "src/core/ReadState.js";
import {
  getTauriRepositories,
  isTauriRuntime,
} from "src/core/TauriDrizzleBridge";
import { createLogger } from "src/core/logger";

const logger = createLogger("BBSMenuModel");
const BBSMENU_CACHE_KEY = "bbsmenu";
const OPENED_BOARDS_CONFIG_KEY = "opened_board_entries";

export interface BBSMenuData {
  status: "success" | "error";
  menu?: BBSMenu[];
  message?: string;
}

/**
 * BBSMenu のデータモデル（オーケストレーター）
 *
 * 板一覧の取得フローを調整する責務のみを持つ。
 * パース・フィルタリングは BBSMenuParser、
 * HTTP通信・キャッシュ管理は BBSMenuFetcher、
 * 未登録板の収集は OtherBoardsCollector が担当する。
 */
export class BBSMenuModel {
  private _bbsmenuOption: Set<string> | null = null;
  private _updatingPromise: Promise<BBSMenuData> | null = null;
  // セッション中のメモリキャッシュ。毎回DBルックアップ+パースを繰り返さないようにする
  private _cachedResult: BBSMenuData | null = null;
  public readonly onChange = new Callbacks({ persistent: true });

  private _fetcher: BBSMenuFetcher;
  private _collector: OtherBoardsCollector;

  constructor() {
    this._fetcher = new BBSMenuFetcher({
      getCache: (url) => container.cache.getCache(url),
      getUpdateIntervalDays: () =>
        +container.config.get("bbsmenu_update_interval"),
      getExcludeTslds: () => this._getExcludeTslds(),
    });

    this._collector = new OtherBoardsCollector({
      getOpenedBoards: () => {
        const raw = container.config.get(OPENED_BOARDS_CONFIG_KEY);
        if (!raw) {
          return [];
        }

        try {
          const parsed = JSON.parse(raw) as Array<{
            url?: unknown;
            title?: unknown;
          }>;
          if (!Array.isArray(parsed)) {
            return [];
          }

          return parsed
            .map((entry) => {
              if (!entry || typeof entry.url !== "string") {
                return null;
              }

              return {
                url: entry.url,
                title: typeof entry.title === "string" ? entry.title : undefined,
              };
            })
            .filter(
              (
                entry,
              ): entry is {
                url: string;
                title?: string;
              } => entry !== null,
            );
        } catch {
          // 破損データは空扱いにして板一覧表示を継続する。
          return [];
        }
      },
      getAllReadStates: () => ReadState.getAll(),
      getUniqueHistory: () => History.getUnique(),
      getCachedBoardTitles: () => {
        const str = container.config.get("other_board_titles");
        return str ? (JSON.parse(str) as Record<string, string>) : {};
      },
      saveBoardTitles: (titles) =>
        container.config.set("other_board_titles", JSON.stringify(titles)),
      resolveBoardTitle: (boardUrl: URL) => askBoardTitle(boardUrl),
    });
  }

  /**
   * configからNG除外TLDのSetを構築して返す。
   * 結果はキャッシュし、forceReload=trueで再構築する。
   */
  private _getExcludeTslds(forceReload = false): Set<string> {
    if (!this._bbsmenuOption || forceReload) {
      const optionStr = container.config.get("bbsmenu_option") ?? "";
      this._bbsmenuOption = BBSMenuParser.parseExcludeOptions(optionStr);
    }
    return this._bbsmenuOption;
  }

  /**
   * 単一のURLから板一覧を取得する。
   * キャッシュが有効な場合はキャッシュを使用し、期限切れまたは強制更新時はHTTP通信を行う。
   */
  async fetchOne(url: string, force = false): Promise<BBSMenu> {
    return this._fetcher.fetch(url, force);
  }

  /**
   * 複数のURLから板一覧を取得し、未登録板を「その他」として追加して返す。
   */
  async fetchAll(forceReload = false): Promise<BBSMenu[]> {
    // 強制更新時はオプションキャッシュをクリア
    if (forceReload) {
      this._getExcludeTslds(true);
    }

    const menus: BBSMenu[] = [];
    const bbsmenuUrls = container.config.get("bbsmenu").split("\n");

    for (const url of bbsmenuUrls) {
      if (url === "" || url.startsWith("//")) continue;
      try {
        const menu = await this.fetchOne(url, forceReload);
        menus.push(menu);
      } catch (error) {
        console.error(error);
        container.toast.notify(
          `板一覧の取得に失敗しました。(<a href="${url}" target="_blank">${url}</a>)`,
          { html: true, backgroundColor: "red" },
        );
      }
    }

    await this._collector.collect(menus);

    return menus;
  }

  /**
   * 板一覧を取得する（重複リクエスト防止付き）。
   * 既に取得中の場合は同じPromiseを返す。
   */
  async get(forceReload = false): Promise<BBSMenuData> {
    // L1: セッション中のメモリキャッシュ
    if (!forceReload && this._cachedResult != null) {
      return this._cachedResult;
    }

    // L2: SQLite キャッシュ（Tauri のみ）
    const tauri = isTauriRuntime();
    logger.debug("isTauriRuntime", { tauri });
    if (!forceReload && tauri) {
      const cached = await this._loadFromSQLite();
      if (cached != null) {
        this._cachedResult = cached;
        return cached;
      }
    }

    if (this._updatingPromise == null) {
      this._updatingPromise = this._update(forceReload);
    }

    try {
      const result = await this._updatingPromise;
      this._cachedResult = result;
      if (tauri && result.status === "success") {
        // Why: SQLite保存は非同期エラーを内部で記録するため、ここでは呼び出すだけでOK
        await this._saveToSQLite(result);
      }
      if (forceReload) {
        this.onChange.call(result);
      }
      return result;
    } catch {
      const errorResult: BBSMenuData = {
        status: "error",
        message: "板一覧の取得に失敗しました",
      };
      if (forceReload) {
        this.onChange.call(errorResult);
      }
      return errorResult;
    }
  }

  private async _loadFromSQLite(): Promise<BBSMenuData | null> {
    try {
      const { tauriBBSMenuCacheRepository } = await getTauriRepositories();
      const record = await tauriBBSMenuCacheRepository.get(BBSMENU_CACHE_KEY);
      logger.debug("SQLiteキャッシュ読み込み", {
        found: record != null,
        lastUpdated: record?.lastUpdated,
      });
      if (record == null) return null;

      const intervalMs =
        +container.config.get("bbsmenu_update_interval") * 24 * 60 * 60 * 1000;
      const expired = Date.now() - record.lastUpdated > intervalMs;
      logger.debug("SQLiteキャッシュ有効期限", { expired, intervalMs });
      if (expired) return null;

      return { status: "success", menu: JSON.parse(record.data) as BBSMenu[] };
    } catch (e) {
      // Why: Tauri SQLiteの初期化に失敗してもアプリがクラッシュしないよう、
      // エラーを記録するのみでnullを返す。呼び出し元はHTTP fetchにフォールバックする
      logger.warn("SQLiteキャッシュ読み込みエラー（Tauri初期化失敗の可能性）", {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private async _saveToSQLite(result: BBSMenuData): Promise<void> {
    if (result.menu == null) return;
    try {
      logger.debug("SQLiteキャッシュ保存開始");
      const { tauriBBSMenuCacheRepository } = await getTauriRepositories();
      await tauriBBSMenuCacheRepository.put({
        key: BBSMENU_CACHE_KEY,
        data: JSON.stringify(result.menu),
        lastUpdated: Date.now(),
      });
      logger.debug("SQLiteキャッシュ保存完了");
    } catch (e) {
      // Why: Tauri SQLiteの初期化に失敗してもアプリがクラッシュしないよう、
      // エラーを記録するのみ。メモリキャッシュ(_cachedResult)で対応する
      logger.warn("SQLiteキャッシュ保存失敗（Tauri初期化失敗の可能性）", {
        name: e instanceof Error ? e.name : "unknown",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async _update(forceReload: boolean): Promise<BBSMenuData> {
    try {
      const menu = await this.fetchAll(forceReload);
      return { status: "success", menu };
    } finally {
      this._updatingPromise = null;
    }
  }
}
