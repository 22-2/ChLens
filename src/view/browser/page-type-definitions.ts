import {
  Bookmark,
  File,
  History,
  House,
  LayoutList,
  ListTree,
  type LucideProps,
  MessageSquareText,
  PenLine,
  ScrollText,
  Settings,
} from "lucide-react";
import type { ComponentType } from "react";
import type { Page, PageType } from "src/view/browser/types";
import { getBoardUrlFromThreadUrl } from "src/view/browser/utils/link-routing";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

export type PageOfType<Type extends PageType> = Extract<Page, { type: Type }>;

export interface PageTypeDefinition<P extends Page = Page> {
  icon: ComponentType<LucideProps>;
  refreshable: boolean;
  filterable: boolean;
  autoRefreshable: boolean;
  /**
   * URL で別ページを区別する種別だけが持つ。持つ種別は、同一性・表示状態のキー・
   * 描画キー・ナビゲーションバーの表示 URL にこの値を使う。
   */
  getLocation?: (page: P) => string;
  /** `getLocation` を持たない種別が、ナビゲーションバーの URL 欄に出す文言。 */
  displayLabel?: string;
  /** 新規タブの履歴。省略した種別は「ホーム → そのページ」にする。 */
  buildHierarchy?: (page: P) => Page[];
}

type PageTypeDefinitions = { [Type in PageType]: PageTypeDefinition<PageOfType<Type>> };

function createHomePage(): Page {
  return { type: "home", title: "ホーム" };
}

/**
 * ページ種別ごとの共通メタデータ。
 * 変更理由: アイコンや更新・絞り込み可否、同一ページの扱いが複数の判定へ散らばると、
 * 新しい種別を追加したときに画面ごとの差が出るため、同じ定義から参照する。
 * 種別ごとに型を絞った関数で書き、URL の取り出し方と種別の組み合わせを型で保証する。
 * 垂直タブバーではタイトルが隠れるためアイコンを必須にし、旧セッションの newTab も描画する。
 * 板ツリーを削除しても板を探す目印を保つため、ListTree は板一覧へ引き継ぐ。
 */
export const PAGE_TYPE_DEFINITIONS: PageTypeDefinitions = {
  home: {
    icon: House,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    buildHierarchy: () => [createHomePage()],
  },
  newTab: {
    icon: File,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    buildHierarchy: () => [createHomePage()],
  },
  boardList: {
    icon: ListTree,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    displayLabel: "板一覧",
  },
  threadList: {
    icon: LayoutList,
    refreshable: true,
    filterable: true,
    autoRefreshable: true,
    getLocation: (page) => page.boardUrl,
  },
  thread: {
    icon: MessageSquareText,
    refreshable: true,
    filterable: true,
    autoRefreshable: true,
    getLocation: (page) => page.threadUrl,
    // 板一覧はホームから明示的に開く入口に限定し、祖先として自動生成しない。
    // スレッドには板を祖先に含め、新規タブで開いたスレから同じ板へ戻れるようにする。
    buildHierarchy: (page) => {
      // 変更理由: 板URLの形式ごとの差をUIのページ階層へ持ち込まないため、導出は共通処理へ委譲する。
      const boardUrl = getBoardUrlFromThreadUrl(page.threadUrl);
      return [
        createHomePage(),
        { type: "threadList", title: boardUrl, boardUrl, boardTitle: boardUrl },
        page,
      ];
    },
  },
  settings: {
    icon: Settings,
    refreshable: false,
    filterable: false,
    autoRefreshable: false,
    displayLabel: "設定",
  },
  bookmarkList: {
    icon: Bookmark,
    refreshable: false,
    filterable: true,
    autoRefreshable: false,
    displayLabel: "ブックマーク",
  },
  historyList: {
    icon: History,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    displayLabel: "閲覧履歴",
  },
  writeHistoryList: {
    icon: PenLine,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    displayLabel: "書き込み履歴",
  },
  logList: {
    icon: ScrollText,
    refreshable: true,
    filterable: true,
    autoRefreshable: false,
    displayLabel: "ログ検索",
  },
};

function getPageTypeDefinition<P extends Page>(page: P): PageTypeDefinition<P> {
  // 変更理由: 対応表の型が種別とページの組み合わせを保証しているが、添字アクセスでは
  // TypeScript が種別ごとの関数の引数を結び付けられないため、ここだけで型を戻す。
  return PAGE_TYPE_DEFINITIONS[page.type] as unknown as PageTypeDefinition<P>;
}

function getPageLocation(page: Page): string | null {
  return getPageTypeDefinition(page).getLocation?.(page) ?? null;
}

export function getPageViewStateKey(page: Page): string {
  const location = getPageLocation(page);
  if (location == null) return page.type;
  return `${page.type}:${normalizePageLocation(location)}`;
}

export function getPageIdentity(page: Page): string {
  // クイックアクセス3種を別IDとして扱い、
  // 「既に開いている判定」で相互に潰し合って遷移不能になる回帰を防ぐ。
  // スレ系は正規化したURLを含む表示状態のキーで区別する。
  return getPageViewStateKey(page);
}

export function getDisplayUrl(page: Page): string {
  return getPageLocation(page) ?? getPageTypeDefinition(page).displayLabel ?? "";
}

// 新規タブ用: ページに対してカノニカルな階層スタックを構築する。
export function buildHierarchy(page: Page): Page[] {
  const definition = getPageTypeDefinition(page);
  if (definition.buildHierarchy) return definition.buildHierarchy(page);
  // URLや別タブから直接開いた場合も、同じタブのホームへ戻れる履歴を持たせる。
  return [createHomePage(), page];
}

export function getPageRenderKey(tabId: string, historyIndex: number, page: Page): string {
  // 描画キーは移行前の書式を保ち、表示状態のキーと違って正規化前の URL を使う。
  const location = getPageLocation(page);
  const pageKey = location == null ? page.type : `${page.type}:${location}`;
  return `${tabId}:${historyIndex}:${pageKey}`;
}
