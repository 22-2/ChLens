import { onChange as BBSMenuOnChange, get as getBBSMenu } from "src/core/BBSMenu.js";
import { BBSMenuData } from "src/core/BBSMenuModel";
import { Request } from "src/core/HTTP";
import { URL } from "src/core/URL";

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
  return bbsmenu.get(url.href) ?? bbsmenu.get(url2.href) ?? null;
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

  return _formatBoardTitle(bookmark.title, new URL(bookmark.url));
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
