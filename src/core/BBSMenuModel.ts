import { BBSMenuParser, ChURL } from "packages/ch-lib/src/index";
import Callbacks from "src/app/Callbacks";
import { Request } from "src/core/HTTP";
import { container } from "src/service-container/index";

export interface BBSBoard {
  title: string;
  url: string;
}

export interface BBSCategory {
  title: string;
  board: BBSBoard[];
}

export interface BBSMenuData {
  status: "success" | "error";
  menu?: BBSCategory[];
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
      const tmpOpt = container.config.get("bbsmenu_option").split("\n");
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
  private _parse(html: string): BBSCategory[] {
    this._updateOptions();

    const excludeTslds = new Set<string>();
    for (const opt of this._bbsmenuOption!) {
      excludeTslds.add(new ChURL(opt).getTsld() || opt);
    }

    const categories = BBSMenuParser.parse(html, {
      excludeTslds,
      bbspinkException: this._bbsmenuOption!.has("bbspink.com"),
    });

    // 互換性のためにプロパティ名を調整 (boards -> board)
    return categories.map((cat) => ({
      title: cat.title,
      board: cat.boards,
    }));
  }

  /**
   * 単一のURLから板一覧を取得
   */
  async fetchOne(url: string, force = false): Promise<BBSCategory[]> {
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
        request.headers["If-Modified-Since"] = new Date(
          cache.lastModified,
        ).toUTCString();
      }

      if (cache.etag != null) {
        request.headers["If-None-Match"] = cache.etag;
      }
      response = await request.send();
    }

    let menu: BBSCategory[];

    if (response?.status === 200) {
      menu = this._parse(response.body);

      // キャッシュ更新
      cache.data = response.body;
      cache.lastUpdated = Date.now();

      const lastModified = new Date(
        response.headers["Last-Modified"] || "dummy",
      ).getTime();

      if (Number.isFinite(lastModified)) {
        cache.lastModified = lastModified;
      }

      await cache.put(response.body, {
        lastModified: Number.isFinite(lastModified) ? lastModified : undefined,
        etag: response.headers["ETag"],
      });
    } else if (cache.data != null) {
      menu = this._parse(cache.data);

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
   * 複数のURLから板一覧を取得してマージ
   */
  async fetchAll(forceReload = false): Promise<BBSCategory[]> {
    this._updateOptions(forceReload);

    const bbsmenu: BBSCategory[] = [];
    const bbsmenuUrl = container.config.get("bbsmenu").split("\n");

    for (const url of bbsmenuUrl) {
      if (url === "" || url.startsWith("//")) {
        continue;
      }
      try {
        const menu = await this.fetchOne(url, forceReload);
        bbsmenu.push(...menu);
      } catch (error) {
        container.notification.notify(
          `板一覧の取得に失敗しました。(<a href="${url}" target="_blank">${url}</a>)`,
          { html: true, backgroundColor: "red" },
        );
      }
    }

    return bbsmenu;
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
