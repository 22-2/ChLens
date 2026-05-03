import { parseBBSMenu, BBSMenu, BBSMenuCategory } from "src/core/parseBBSMenu";
import Callbacks from "src/app/Callbacks";
import { Request } from "src/core/HTTP";
import { container } from "src/service-container/index";
import { URL } from "src/core/URL";
// @ts-ignore
import * as History from "src/core/History.js";
// @ts-ignore
import * as ReadState from "src/core/ReadState.js";
import { ask as askBoardTitle } from "src/core/BoardTitleSolver.js";

export interface BBSMenuData {
  status: "success" | "error";
  menu?: BBSMenu[];
  message?: string;
}

/**
 * BBSMenu のデータモデル
 * 板一覧の取得、キャッシュ管理、状態管理を担当
 */
export class BBSMenuModel {
  private _bbsmenuOption: Set<string> | null = null;
  private _updatingPromise: Promise<BBSMenuData> | null = null;
  public readonly onChange = new Callbacks({ persistent: true });

  /**
   * 板一覧のオプション設定を取得・更新
   */
  private _updateOptions(forceReload = false): void {
    if (!this._bbsmenuOption || forceReload) {
      if (!this._bbsmenuOption) {
        this._bbsmenuOption = new Set();
      } else {
        this._bbsmenuOption.clear();
      }
      const tmpOpt = container.config.get("bbsmenu_option")?.split("\n") || [];
      for (const opt of tmpOpt) {
        if (opt === "" || opt.startsWith("//")) {
          continue;
        }
        this._bbsmenuOption.add(opt);
      }
    }
  }

  /**
   * HTMLをパースして板一覧に変換
   */
  private _parse(html: string, url: string): BBSMenu {
    this._updateOptions();

    const menu = parseBBSMenu(html);

    // 意図: BBSMenuに名前が無い場合は、URLのホスト名を名前にする
    if (!menu.name) {
      try {
        menu.name = new URL(url).hostname;
      } catch {
        menu.name = url;
      }
    }

    const excludeTslds = new Set<string>();
    for (const opt of this._bbsmenuOption!) {
      try {
        excludeTslds.add(new URL(opt).getTsld() || opt);
      } catch {
        excludeTslds.add(opt);
      }
    }

    menu.categories = menu.categories
      .map((cat) => ({
        ...cat,
        boards: cat.boards.filter((board) => {
          try {
            const boardUrl = new URL(board.url);
            const tsld = boardUrl.getTsld();
            if (excludeTslds.has(tsld)) {
              // bbspink.com の例外処理
              if (tsld === "bbspink.com" && this._bbsmenuOption!.has("bbspink.com")) {
                return true;
              }
              return false;
            }
          } catch {
            // URLが不正な場合は除外しない
          }
          return true;
        }),
      }))
      .filter((cat) => cat.boards.length > 0);

    return menu;
  }

  /**
   * 単一のURLから板一覧を取得
   */
  async fetchOne(url: string, force = false): Promise<BBSMenu> {
    const cache = container.cache.getCache(url);
    let response: any;

    try {
      await cache.get();
      if (force) {
        throw new Error("最新のものを取得するために通信します");
      }
      if (
        Date.now() - cache.lastUpdated >
        +container.config.get("bbsmenu_update_interval") * 1000 * 60 * 60 * 24
      ) {
        throw new Error("キャッシュが期限切れなので通信します");
      }
    } catch (error) {
      // 通信
      const request = new Request("GET", url, {
        mimeType: "text/plain; charset=Shift_JIS",
      });
      if (cache.lastModified != null) {
        request.headers["If-Modified-Since"] = new Date(cache.lastModified).toUTCString();
      }

      if (cache.etag != null) {
        request.headers["If-None-Match"] = cache.etag;
      }
      response = await request.send();
    }

    let menu: BBSMenu;

    if (response?.status === 200) {
      menu = this._parse(response.body, url);

      // キャッシュ更新
      cache.data = response.body;
      cache.lastUpdated = Date.now();

      const lastModified = new Date(response.headers["Last-Modified"] || "dummy").getTime();

      if (Number.isFinite(lastModified)) {
        cache.lastModified = lastModified;
      }

      await cache.put(response.body, {
        lastModified: Number.isFinite(lastModified) ? lastModified : undefined,
        etag: response.headers["ETag"],
      });
    } else if (cache.data != null) {
      menu = this._parse(cache.data, url);

      // キャッシュ更新
      if (response?.status === 304) {
        cache.lastUpdated = Date.now();
        await cache.put(cache.data);
      }
    } else {
      throw new Error("板一覧の取得に失敗しました");
    }

    return menu;
  }

  /**
   * 複数のURLから板一覧を取得
   */
  async fetchAll(forceReload = false): Promise<BBSMenu[]> {
    this._updateOptions(forceReload);

    const menus: BBSMenu[] = [];
    const bbsmenuUrls = container.config.get("bbsmenu").split("\n");

    for (const url of bbsmenuUrls) {
      if (url === "" || url.startsWith("//")) {
        continue;
      }
      try {
        const menu = await this.fetchOne(url, forceReload);
        menus.push(menu);
      } catch (error) {
        container.notification.notify(
          `板一覧の取得に失敗しました。(<a href="${url}" target="_blank">${url}</a>)`,
          { html: true, backgroundColor: "red" },
        );
      }
    }

    await this._addOtherBoards(menus);

    return menus;
  }

  /**
   * 未登録の板を「その他」カテゴリとして追加
   */
  private async _addOtherBoards(menus: BBSMenu[]): Promise<void> {
    const registeredUrls = new Set<string>();
    for (const menu of menus) {
      for (const cat of menu.categories) {
        for (const board of cat.boards) {
          try {
            registeredUrls.add(new URL(board.url).href);
          } catch {
            registeredUrls.add(board.url);
          }
        }
      }
    }

    const otherBoards: { name: string; url: string }[] = [];
    const seenUrls = new Set<string>();

    const addIfNew = (url: string, name: string) => {
      try {
        const normalizedUrl = new URL(url).href;
        if (!registeredUrls.has(normalizedUrl) && !seenUrls.has(normalizedUrl)) {
          otherBoards.push({ name, url: normalizedUrl });
          seenUrls.add(normalizedUrl);
        }
      } catch {
        // ignore invalid URL
      }
    };

    // 既読情報から取得
    try {
      const readStates = await ReadState.getAll();
      for (const rs of readStates) {
        // board_url が保存されていればそれを使い、なければスレッドURLから変換する
        // ただし board タイプの URL に toBoard() を呼ぶとエラーになるため型チェックを行う
        let boardUrl: string;
        if (rs.board_url) {
          boardUrl = rs.board_url;
        } else {
          const u = new URL(rs.url);
          if (u.guessType().type !== "thread") continue;
          boardUrl = u.toBoard().href;
        }
        addIfNew(boardUrl, boardUrl);
      }
    } catch (e) {
      console.error("Failed to fetch read states for Other category", e);
    }

    // 履歴から取得
    // toBoard() はスレッドURLにのみ有効なため、guessType で type を確認してから呼ぶ
    try {
      const historyEntries = await History.getUnique();
      for (const entry of historyEntries) {
        const u = new URL(entry.url);
        if (u.guessType().type !== "thread") continue;
        const boardUrl = u.toBoard().href;
        addIfNew(boardUrl, entry.boardTitle || boardUrl);
      }
    } catch (e) {
      console.error("Failed to fetch history for Other category", e);
    }

    const otherBoardTitlesStr = container.config.get("other_board_titles");
    const otherBoardTitles: Record<string, string> = otherBoardTitlesStr
      ? (JSON.parse(otherBoardTitlesStr) as Record<string, string>)
      : {};

    // キャッシュ済みの板名を即座に適用する（ブロッキングなし）
    for (const board of otherBoards) {
      if (board.name === board.url && otherBoardTitles[board.url]) {
        board.name = otherBoardTitles[board.url];
      }
    }

    // 未解決の板名をバックグラウンドで非同期取得しキャッシュに保存する
    // （板一覧の表示をブロックしないため fire-and-forget にする）
    void (async () => {
      let hasNewTitles = false;
      await Promise.all(
        otherBoards.map(async (board) => {
          if (board.name === board.url) {
            try {
              const title = await askBoardTitle(new URL(board.url));
              if (title) {
                board.name = title;
                otherBoardTitles[board.url] = title;
                hasNewTitles = true;
              }
            } catch {
              // Ignore resolution errors
            }
          }
        })
      );
      if (hasNewTitles) {
        container.config.set("other_board_titles", JSON.stringify(otherBoardTitles));
      }
    })();

    if (otherBoards.length > 0) {
      let otherMenu = menus.find((m) => m.name === "その他" || m.name === "Other");
      if (!otherMenu) {
        otherMenu = { name: "その他", categories: [] };
        menus.push(otherMenu);
      }
      otherMenu.categories.push({
        name: "一度開いた板",
        boards: otherBoards,
      });
    }
  }

  /**
   * 板一覧を取得（キャッシュまたは通信）
   */
  async get(forceReload = false): Promise<BBSMenuData> {
    if (this._updatingPromise == null) {
      this._updatingPromise = this._update(forceReload);
    }

    try {
      const result = await this._updatingPromise;
      if (forceReload) {
        this.onChange.call(result);
      }
      return result;
    } catch (error) {
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

  /**
   * 内部更新処理
   */
  private async _update(forceReload: boolean): Promise<BBSMenuData> {
    try {
      const menu = await this.fetchAll(forceReload);
      return { status: "success", menu };
    } finally {
      this._updatingPromise = null;
    }
  }
}
