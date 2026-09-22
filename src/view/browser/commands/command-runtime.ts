import { container } from "src/service-container";
import type { IToastService } from "src/service-container/interfaces";
import type { ViewSurface } from "src/view/browser/hooks/use-view-surface";
import { copyText, formatMarkdownLink } from "src/view/browser/utils/clipboard";

/**
 * コマンドが操作する対象を、表示中のページから独立して表現する。
 *
 * 変更理由: 一覧行や別窓のタブメニューは、現在のアクティブページではなく
 * 選択されたスレッドを操作するため、巨大なページ用コンテキストを要求しない
 * 小さな対象型を用意する。
 */
export interface CommandTarget {
  readonly kind: "thread" | "board";
  readonly url: string;
  readonly title: string;
}

export type CommandRequest =
  | {
      readonly id: "target.copy";
      readonly args: {
        readonly target: CommandTarget;
        readonly format: "title" | "url" | "title-url" | "markdown";
      };
    }
  | {
      readonly id: "target.bookmark.set";
      readonly args: {
        readonly target: CommandTarget;
        readonly bookmarked: boolean;
      };
    }
  | {
      readonly id: "target.bookmark.toggle";
      readonly args: {
        readonly target: CommandTarget;
      };
    };

/**
 * コマンド実行時に使う表示先と通知先をまとめる。
 *
 * 変更理由: 別窓から実行した操作がメイン窓のclipboard/documentへ戻らないよう、
 * 実行入口で表示環境を必須にする。タブ操作などの状態更新は別のruntimeで後から
 * 拡張できるよう、ここでは対象操作に必要な最小値だけを定義する。
 */
export interface CommandRuntime {
  readonly surface: ViewSurface;
  readonly toast: IToastService;
}

function getCommandLabel(request: CommandRequest): string {
  switch (request.id) {
    case "target.copy":
      return "コピー";
    case "target.bookmark.set":
    case "target.bookmark.toggle":
      return "ブックマークの更新";
  }
}

function getCopyText(request: Extract<CommandRequest, { id: "target.copy" }>): string {
  const { target, format } = request.args;
  switch (format) {
    case "title":
      return target.title;
    case "url":
      return target.url;
    case "title-url":
      return `${target.title}\n${target.url}`;
    case "markdown":
      return formatMarkdownLink(target.title, target.url);
  }
}

/**
 * 対象付きコマンドを実行する低位API。
 *
 * 失敗は呼び出し元へthrowする。メニューイベント用の入口だけがログと通知を
 * まとめて担当することで、入口を増やしても同じエラーが二重に表示されない。
 */
export async function executeCommandRequest(
  request: CommandRequest,
  runtime: CommandRuntime,
): Promise<void> {
  switch (request.id) {
    case "target.copy":
      await copyText(getCopyText(request), runtime.surface);
      return;
    case "target.bookmark.set": {
      const { target, bookmarked } = request.args;
      const currentBookmarked = Boolean(container.bookmark.get(target.url));
      if (currentBookmarked === bookmarked) {
        return;
      }

      if (bookmarked) {
        await Promise.resolve(
          container.bookmark.add({
            url: target.url,
            title: target.title,
            type: target.kind,
          }),
        );
      } else {
        await Promise.resolve(container.bookmark.remove(target.url));
      }
      return;
    }
    case "target.bookmark.toggle": {
      const { target } = request.args;
      const currentBookmarked = Boolean(container.bookmark.get(target.url));
      await executeCommandRequest(
        {
          id: "target.bookmark.set",
          args: { target, bookmarked: !currentBookmarked },
        },
        runtime,
      );
      return;
    }
  }
}

/**
 * UIイベントから安全に呼び出せる対象付きコマンド入口。
 *
 * 変更理由: ReactのイベントハンドラはPromiseを待たないため、rejectを放置すると
 * 別窓ではエラーが画面に出ず、原因も追跡できない。ここで操作単位のログと通知を
 * 共通化し、各メニューを薄いadapterに保つ。
 */
export async function runCommandRequest(
  request: CommandRequest,
  runtime: CommandRuntime,
): Promise<boolean> {
  try {
    await executeCommandRequest(request, runtime);
    return true;
  } catch (error: unknown) {
    console.error("対象付きコマンドの実行に失敗しました", {
      commandId: request.id,
      target: request.args.target,
      error,
    });
    runtime.toast.error(`${getCommandLabel(request)}に失敗しました`);
    return false;
  }
}
