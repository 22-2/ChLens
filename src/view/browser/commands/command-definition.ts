import type { LucideIcon } from "lucide-react";
import type { Dispatch } from "react";
import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";
import type { CommandTarget } from "src/view/browser/commands/command-runtime";
import type { TabCommandId } from "src/view/browser/commands/tab-command-runtime";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ScopedTabAction } from "src/view/browser/state/tabs/use-tab-store";
import type { Page, Tab } from "src/view/browser/types";
import { persistConfigValue, readConfigValue } from "src/view/browser/utils/config-setting";

// 変更理由: コマンド定義の型と、定義から使う共通処理を全コマンドの一覧から分ける。
// 機能側の登録関数や登録 API が一覧のモジュールに依存せずに済み、型の循環 import もなくなる。

export const BROWSER_COMMAND_GROUP_LABELS = {
  navigation: "移動",
  tab: "タブ",
  page: "現在のページ",
  layout: "表示",
  copy: "コピー",
} as const;

export type BrowserCommandGroup = keyof typeof BROWSER_COMMAND_GROUP_LABELS;

export const BROWSER_COMMAND_GROUP_ORDER: readonly BrowserCommandGroup[] = [
  "navigation",
  "tab",
  "page",
  "layout",
  "copy",
];

export interface BrowserCommandContext {
  // コマンドはフォーカス中のペインではなく、実際に表示している窓の対象を操作する。
  viewPage: Page;
  viewTab: Tab;
  tabs: readonly Tab[];
  closedTabs: readonly Tab[];
  isTwoPane: boolean;
  isZenMode?: boolean;
  isWritePanelOpen: boolean;
  /** 現在のスレッドへ書き込めるか。未指定なら通常のスレッドとして扱う。 */
  canWriteToThread?: boolean;
  /** スレログ削除後、板ごとの一覧キャッシュからも既読表示を除く。 */
  clearCachedThreadReadState: (threadUrl: string) => Promise<void>;
  dispatch: Dispatch<ScopedTabAction>;
  toggleWritePanel: () => void;
  openResponseJumpDialog: () => void;
  openNextThreadSearchDialog: () => Promise<void>;
  openRelatedThreadSearchDialog?: () => Promise<void>;
  openArchiveReplayWindow: () => void;
  // 履歴・再取得・タブライフサイクルは対象タブを明示する実行器へ委譲し、
  // メニューとパレットで挙動を揃える。
  runTabCommand?: (id: TabCommandId) => boolean;
  // 変更理由: コマンドパレットを別窓へ載せた時も、通知とイベントを表示中の窓へ返すため。
  // 既存の外部呼び出しとの互換性を保つため未指定時は従来の共有サービスへフォールバックする。
  viewSurface?: ViewSurface;
  toast?: IToastService;
}

export interface BrowserCommandDefinition {
  id: string;
  label: string | ((context: BrowserCommandContext) => string);
  englishLabel: string | ((context: BrowserCommandContext) => string);
  description?: string;
  keywords?: readonly string[];
  group: BrowserCommandGroup;
  icon: LucideIcon;
  when?: (context: BrowserCommandContext) => boolean;
  isEnabled?: (context: BrowserCommandContext) => boolean;
  run: (context: BrowserCommandContext) => void | Promise<void>;
}

export interface ResolvedBrowserCommand {
  id: string;
  label: string;
  englishLabel: string;
  description?: string;
  keywords: readonly string[];
  group: BrowserCommandGroup;
  icon: LucideIcon;
  enabled: boolean;
}

export function getCommandSurface(context: BrowserCommandContext): ViewSurface {
  return (
    context.viewSurface ?? {
      window: globalThis.window,
      document: globalThis.document,
    }
  );
}

export function getCommandToast(context: BrowserCommandContext): IToastService {
  return context.toast ?? container.toast;
}

export function getCommandPageTarget(page: Page): CommandTarget | null {
  switch (page.type) {
    case "thread":
      return {
        url: page.threadUrl,
        title: page.title || page.threadUrl,
        kind: "thread",
      };

    case "threadList":
      return {
        url: page.boardUrl,
        title: page.boardTitle || page.title || page.boardUrl,
        kind: "board",
      };

    default:
      return null;
  }
}

// 変更理由: 設定の真偽値はフック側と同じ "on" / "off" の書式で保存し、
// 画面と読み替え結果が食い違わないようにする。
export function isCommandConfigSwitchOn(key: string): boolean {
  return readConfigValue(key) === "on";
}

/** 機能間で設定トグルの読み書きを揃え、保存失敗を共通の設定境界で記録する。 */
export function toggleCommandConfigSwitch(key: string): void {
  persistConfigValue(key, isCommandConfigSwitchOn(key) ? "off" : "on", "コマンドパレット");
}
