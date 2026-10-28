import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { createLogger } from "src/app/logger";
import type { Page, PageType } from "src/view/browser/types";
import { UnavailablePageIcon } from "src/view/browser/ui/icons";
import { normalizePageLocation } from "src/view/browser/utils/page-location";

const logger = createLogger("view/browser/page-type-definitions");
const loggedMissingPageTypes = new Set<PageType>();

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

export type PageTypeDefinitions = {
  [Type in PageType]: PageTypeDefinition<PageOfType<Type>>;
};

export interface PageTypeDefinitionRegistration {
  dispose: () => void;
}

const pageTypeDefinitions = new Map<
  PageType,
  { definition: PageTypeDefinition<never>; ownerId: string }
>();
const unavailablePageTypeDefinition: PageTypeDefinition<never> = {
  icon: UnavailablePageIcon,
  refreshable: false,
  filterable: false,
  autoRefreshable: false,
  displayLabel: "利用できないページ",
};

/** 機能が所有するページ種別の共通メタデータを登録する。 */
export function registerPageTypeDefinition<Type extends PageType>(
  type: Type,
  definition: PageTypeDefinition<PageOfType<Type>>,
  ownerId: string,
): PageTypeDefinitionRegistration {
  const existing = pageTypeDefinitions.get(type);
  if (existing) {
    logger.error("ページ種別の二重登録を拒否しました", {
      type,
      ownerId,
      existingOwnerId: existing.ownerId,
    });
    return { dispose: () => undefined };
  }

  const entry = { definition, ownerId };
  pageTypeDefinitions.set(type, entry);
  loggedMissingPageTypes.delete(type);
  let disposed = false;
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (pageTypeDefinitions.get(type) === entry) pageTypeDefinitions.delete(type);
    },
  };
}

/** 描画と保存では、未登録のページを存在しないものとして捨てない。 */
export function isPageTypeRegistered(type: PageType): boolean {
  return pageTypeDefinitions.has(type);
}

function requirePageTypeDefinition<Type extends PageType>(type: Type): PageTypeDefinition<never> {
  const definition = pageTypeDefinitions.get(type);
  if (definition) return definition.definition;
  if (!loggedMissingPageTypes.has(type)) {
    loggedMissingPageTypes.add(type);
    logger.warn("ページ種別の定義がないため、利用不可のページとして扱います", { type });
  }
  return unavailablePageTypeDefinition;
}

export function getPageTypeDefinitionByType<Type extends PageType>(
  type: Type,
): PageTypeDefinition<PageOfType<Type>> {
  // 登録時に種別と定義の型を対応させているが、Mapはその対応を保持しないためここで戻す。
  return requirePageTypeDefinition(type) as PageTypeDefinition<PageOfType<Type>>;
}

function getPageTypeDefinition(page: Page): PageTypeDefinition {
  // URL由来の判定はページ種別に登録された同じ定義を使う。
  return getPageTypeDefinitionByType(page.type);
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
  return [{ type: "home", title: "ホーム" }, page];
}

export function getPageRenderKey(tabId: string, historyIndex: number, page: Page): string {
  // 描画キーは移行前の書式を保ち、表示状態のキーと違って正規化前の URL を使う。
  const location = getPageLocation(page);
  const pageKey = location == null ? page.type : `${page.type}:${location}`;
  return `${tabId}:${historyIndex}:${pageKey}`;
}
