import {
  get as getBBSMenu,
  getCached as getCachedBBSMenu,
  onChange as BBSMenuOnChange,
} from "src/core/BBSMenu.js";
import { BBSMenuData } from "src/core/BBSMenuModel";
import { getBoardUrlKey } from "src/core/BoardUrlNormalizer";
import { Request } from "src/core/HTTP";
import { URL } from "src/core/URL";
import { container } from "src/service-container/index";

const isSavedTitleResolved = (title: string | null, boardUrl: string): title is string => {
  if (!title?.trim()) return false;
  const url = new window.URL(boardUrl);
  // 「その他」のURLや旧履歴の板キーは仮の名前。選択した板の名前取得を妨げない。
  return (
    getBoardUrlKey(title) !== getBoardUrlKey(boardUrl) &&
    title !== url.pathname.split("/").filter(Boolean).at(-1)
  );
};

export const getCachedTitles = async (): Promise<Map<string, string>> => {
  // 一覧の表示だけで全板のSETTING.TXTを取得しないよう、通信可能なaskとは入口を分ける。
  const titles = new Map<string, string>();
  const addTitle = (url: string, title: string) => {
    const key = getBoardUrlKey(url);
    if (key && isSavedTitleResolved(title, url)) titles.set(key, title);
  };
  const cached = await getCachedBBSMenu();
  for (const menu of cached.menu ?? []) {
    for (const category of menu.categories) {
      for (const board of category.boards) addTitle(board.url, board.name);
    }
  }
  const rawTitles = container.config.get("other_board_titles");
  if (rawTitles) {
    try {
      const parsed: unknown = JSON.parse(rawTitles);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [url, title] of Object.entries(parsed)) {
          if (typeof title === "string") addTitle(url, title);
        }
      }
    } catch (error) {
      console.error("保存済みの板名を読み込めませんでした", error);
    }
  }
  if (typeof app !== "undefined" && app.bookmark) {
    // 初回のローカル読み取りを待ち、起動直後も保存済みのお気に入り名を使う。
    try {
      await app.bookmark.promiseFirstScan;
    } catch (error) {
      console.error("お気に入りの初回読み込みに失敗しました", error);
    }
    for (const board of app.bookmark.getAllBoards()) {
      addTitle(board.url, _formatBoardTitle(board.title, new URL(board.url)));
    }
  }
  return titles;
};

// 旧形式 (menu?: {board: []}[]) を表すローカル interface 群は実際のデータ構造
// (BBSMenuData: menu?: BBSMenu[] = categories/boards 形式) と食い違っていたため削除し、
// 供給元である BBSMenuModel の型をそのまま使う。
let _bbsmenu: Map<string, string> | null = null;
let _bbsmenuPromise: Promise<void> | null = null;

const _generateBBSMenu = ({ status, menu, message }: BBSMenuData): void => {
  if (status === "error") {
    void (async () => {
      await app.defer();
      app.message.send("notify", {
        message,
        background_color: "red",
      });
    })();
  }

  if (menu == null) {
    throw new Error("板一覧が取得できませんでした");
  }

  const bbsmenu = new Map<string, string>();
  for (const item of menu) {
    for (const category of item.categories) {
      for (const board of category.boards) {
        bbsmenu.set(board.url, board.name);
      }
    }
  }
  _bbsmenu = bbsmenu;
};

const _setBBSMenu = async (): Promise<void> => {
  const obj = await getBBSMenu();
  _generateBBSMenu(obj);
  // 意図: 板一覧の更新通知を購読してキャッシュMapを常に最新に保つ。
  BBSMenuOnChange.add((updatedObj) => {
    _generateBBSMenu(updatedObj);
  });
};

const _getBBSMenu = async (): Promise<Map<string, string>> => {
  if (_bbsmenu != null) {
    return _bbsmenu;
  }

  if (_bbsmenuPromise != null) {
    await _bbsmenuPromise;
  } else {
    _bbsmenuPromise = _setBBSMenu();
    await _bbsmenuPromise;
    _bbsmenuPromise = null;
  }

  if (_bbsmenu == null) {
    throw new Error("板一覧が初期化されていません");
  }

  return _bbsmenu;
};

const searchFromBBSMenu = async (url: URL): Promise<string | null> => {
  const bbsmenu = await _getBBSMenu();
  // スキーム違いでも同じ板を引けるようにトグルURLを併用する。
  const url2 = url.createProtocolToggled();
  const title = bbsmenu.get(url.href) ?? bbsmenu.get(url2.href) ?? null;
  return isSavedTitleResolved(title, url.href) ? title : null;
};

const _formatBoardTitle = (title: string, url: URL): string => {
  switch (url.getTsld()) {
    case "5ch.io":
      return title.replace("＠2ch掲示板", "");
    case "2ch.sc":
      return `${title}_sc`;
    case "open2ch.net":
      return `${title}_op`;
    default:
      return title;
  }
};

const searchFromBookmark = (url: URL): string | null => {
  if (!app.bookmark) {
    return null;
  }

  const url2 = url.createProtocolToggled();
  const bookmark = app.bookmark.get(url.href) ?? app.bookmark.get(url2.href);
  if (bookmark == null) {
    return null;
  }

  const title = _formatBoardTitle(bookmark.title, new URL(bookmark.url));
  return isSavedTitleResolved(title, url.href) ? title : null;
};

const searchFromSettingTXT = async (url: URL): Promise<string> => {
  const { status, body } = await new Request("GET", `${url.href}SETTING.TXT`, {
    mimeType: "text/plain; charset=Shift_JIS",
    timeout: 1000 * 10,
  }).send();

  if (status !== 200) {
    throw new Error("SETTING.TXTを取得する通信に失敗しました");
  }

  const titleOrigMatch = /^BBS_TITLE_ORIG=(.+)$/m.exec(body);
  if (titleOrigMatch) {
    return _formatBoardTitle(titleOrigMatch[1], url);
  }

  const titleMatch = /^BBS_TITLE=(.+)$/m.exec(body);
  if (titleMatch) {
    return _formatBoardTitle(titleMatch[1], url);
  }

  // 意図: 一部サーバーは板名を返さないため、板キーへフォールバックして失敗連鎖を防ぐ。
  const boardKey = url.pathname.split("/")[1];
  if (boardKey) {
    return boardKey;
  }

  throw new Error("SETTING.TXTに名前の情報がありません");
};

const searchFromJbbsAPI = async (url: URL): Promise<string> => {
  const tmp = url.pathname.split("/");
  const ajaxPath = `${url.protocol}//jbbs.shitaraba.net/bbs/api/setting.cgi/${tmp[1]}/${tmp[2]}/`;

  const { status, body } = await new Request("GET", ajaxPath, {
    mimeType: "text/plain; charset=EUC-JP",
    timeout: 1000 * 10,
  }).send();

  if (status !== 200) {
    throw new Error("したらばの板のAPIの通信に失敗しました");
  }

  const titleMatch = /^BBS_TITLE=(.+)$/m.exec(body);
  if (titleMatch) {
    return titleMatch[1];
  }

  throw new Error("したらばの板のAPIに名前の情報がありません");
};

export const ask = async (url: URL): Promise<string | null> => {
  let name = await searchFromBBSMenu(url);
  if (name != null) {
    return name;
  }

  name = searchFromBookmark(url);
  if (name != null) {
    return name;
  }

  try {
    if (url.guessType().bbsType === "2ch") {
      return await searchFromSettingTXT(url);
    }

    if (url.guessType().bbsType === "jbbs") {
      return await searchFromJbbsAPI(url);
    }

    return null;
  } catch (e) {
    throw new Error(`板名の取得に失敗しました: ${String(e)}`, { cause: e });
  }
};

// コマンドなどURL文字列しか持たない呼び出し元が、旧URLクラスの生成責務を
// 重複して持たずに板名解決を再実行できる入口。
export const askByUrl = async (boardUrl: string): Promise<string | null> => ask(new URL(boardUrl));
