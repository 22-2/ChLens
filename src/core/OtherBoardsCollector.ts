import { BBSMenu } from "src/core/BBSMenuParser";
import { URL } from "src/core/URL";

export interface ReadStateEntry {
  url: string;
  board_url?: string;
}

export interface HistoryEntry {
  url: string;
  boardTitle?: string;
}

export interface OpenedBoardEntry {
  url: string;
  title?: string;
}

/**
 * ReadState・履歴から未登録板を収集する責務を担うインターフェース。
 * テスト時にモックに差し替えられる。
 */
export interface IOtherBoardsDeps {
  getOpenedBoards(): Promise<OpenedBoardEntry[]> | OpenedBoardEntry[];
  getAllReadStates(): Promise<ReadStateEntry[]>;
  getUniqueHistory(): Promise<HistoryEntry[]>;
  getCachedBoardTitles(): Record<string, string>;
  saveBoardTitles(titles: Record<string, string>): void;
  resolveBoardTitle(boardUrl: URL): Promise<string | null>;
}

/**
 * BBSMenuに登録されていない板を「その他」カテゴリとして収集するクラス。
 * ReadState・履歴を参照し、未登録の板URLを収集する。
 * 板名の非同期解決はfire-and-forgetで行い、表示をブロックしない。
 */
export class OtherBoardsCollector {
  constructor(private readonly deps: IOtherBoardsDeps) {}

  /**
   * menusに登録されていない板を収集し、「その他」メニューとして追加する。
   * 板名の解決はバックグラウンドで非同期に行われる。
   */
  async collect(menus: BBSMenu[]): Promise<void> {
    const registeredUrls = this._buildRegisteredUrlSet(menus);
    const otherBoards = await this._collectUnregisteredBoards(registeredUrls);

    if (otherBoards.length === 0) return;

    this._applyBoardTitles(otherBoards);
    this._resolveUnknownTitlesInBackground(otherBoards);
    this._appendToMenus(menus, otherBoards);
  }

  /**
   * 既存メニューに登録済みのURL一覧をSetで返す。
   */
  private _buildRegisteredUrlSet(menus: BBSMenu[]): Set<string> {
    const registered = new Set<string>();
    for (const menu of menus) {
      for (const cat of menu.categories) {
        for (const board of cat.boards) {
          try {
            registered.add(new URL(board.url).href);
          } catch {
            registered.add(board.url);
          }
        }
      }
    }
    return registered;
  }

  /**
   * ReadStateと履歴から未登録の板URLを収集して返す。
   */
  private async _collectUnregisteredBoards(
    registeredUrls: Set<string>,
  ): Promise<{ name: string; url: string }[]> {
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
        // 不正なURLは無視
      }
    };

    // 明示的に「板を開いた」操作は readState/history より先に取り込み、
    // 未登録板でも「一度開いた板」に必ず残るようにする。
    try {
      const openedBoards = await this.deps.getOpenedBoards();
      for (const opened of openedBoards) {
        if (!opened || typeof opened.url !== "string") {
          continue;
        }

        const trimmedUrl = opened.url.trim();
        if (trimmedUrl === "") {
          continue;
        }

        const title =
          typeof opened.title === "string" && opened.title.trim() !== ""
            ? opened.title
            : trimmedUrl;
        addIfNew(trimmedUrl, title);
      }
    } catch (e) {
      console.error("Failed to fetch opened boards for Other category", e);
    }

    // ReadStateから収集
    try {
      const readStates = await this.deps.getAllReadStates();
      for (const rs of readStates) {
        try {
          let boardUrl = rs.board_url;
          if (!boardUrl) {
            const u = new URL(rs.url);
            if (u.guessType().type !== "thread") continue;
            boardUrl = u.toBoard().href;
          }
          addIfNew(boardUrl, boardUrl);
        } catch {
          // 不正なURLは無視
        }
      }
    } catch (e) {
      console.error("Failed to fetch read states for Other category", e);
    }

    // 履歴から収集
    try {
      const historyEntries = await this.deps.getUniqueHistory();
      for (const entry of historyEntries) {
        try {
          const u = new URL(entry.url);
          if (u.guessType().type !== "thread") continue;
          const boardUrl = u.toBoard().href;
          addIfNew(boardUrl, entry.boardTitle || boardUrl);
        } catch {
          // 不正なURLは無視
        }
      }
    } catch (e) {
      console.error("Failed to fetch history for Other category", e);
    }

    return otherBoards;
  }

  /**
   * キャッシュ済みの板名を即座に適用する（ブロッキングなし）。
   */
  private _applyBoardTitles(boards: { name: string; url: string }[]): void {
    const cached = this.deps.getCachedBoardTitles();
    for (const board of boards) {
      if (board.name === board.url && cached[board.url]) {
        board.name = cached[board.url];
      }
    }
  }

  /**
   * 未解決の板名をバックグラウンドで非同期取得しキャッシュに保存する。
   * 板一覧の表示をブロックしないためfire-and-forgetにする。
   */
  private _resolveUnknownTitlesInBackground(boards: { name: string; url: string }[]): void {
    void (async () => {
      const cached = this.deps.getCachedBoardTitles();
      let hasNewTitles = false;

      await Promise.all(
        boards.map(async (board) => {
          if (board.name === board.url) {
            try {
              const title = await this.deps.resolveBoardTitle(new URL(board.url));
              if (title) {
                board.name = title;
                cached[board.url] = title;
                hasNewTitles = true;
              }
            } catch {
              // 解決失敗は無視
            }
          }
        }),
      );

      if (hasNewTitles) {
        this.deps.saveBoardTitles(cached);
      }
    })();
  }

  /**
   * 収集した板を「その他」メニューとしてmenusに追加する。
   */
  private _appendToMenus(menus: BBSMenu[], boards: { name: string; url: string }[]): void {
    let otherMenu = menus.find((m) => m.name === "その他" || m.name === "Other");
    if (!otherMenu) {
      otherMenu = { name: "その他", categories: [] };
      menus.push(otherMenu);
    }
    otherMenu.categories.push({
      name: "一度開いた板",
      boards,
    });
  }
}
