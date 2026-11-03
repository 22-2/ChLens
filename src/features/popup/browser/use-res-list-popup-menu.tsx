import { Copy, Image as ImageIcon, Pin, PinOff } from "lucide-react";
import { useCallback } from "react";
import type { IRes } from "src/service-container";
import { COMMAND_REQUEST_IDS, runCommandRequest } from "src/view/browser/commands/command-runtime";
import { useTheme } from "src/view/browser/hooks/use-theme";
import { useToast } from "src/view/browser/hooks/use-toast";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import type { ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import { canCopyImageToClipboard, copyImageWithNotice } from "src/view/browser/utils/clipboard";
import { formatResForCopy } from "src/view/browser/utils/response-format";
import { canvasToBlob, renderResponseListImageCanvas } from "src/view/browser/utils/response-image";

/** 一括コピーの文面。表示順を保ち、末尾にスレタイとURLを付ける。 */
function buildResListCopyText(items: IRes[], threadTitle?: string, threadUrl?: string): string {
  const sections = [items.map(formatResForCopy).join("\n\n")];
  const threadInfo = [threadTitle, threadUrl].filter((value): value is string => value != null);
  if (threadInfo.length > 0) {
    sections.push(threadInfo.join("\n"));
  }
  return sections.join("\n\n");
}

/** IDポップアップとアンカーポップアップで、メニュー項目のIDと文言だけが異なる。 */
const MENU_VARIANTS = {
  id: {
    copyId: "copy-id-responses",
    copyLabel: "IDのレスを一括コピー",
    imageId: "copy-id-image",
    imageLabel: "IDのレスを画像としてコピー",
    imageNotice: "IDのレス画像",
    pinId: "toggle-id-pin",
  },
  anchor: {
    copyId: "copy-anchor-responses",
    copyLabel: "参照を一括コピー",
    imageId: "copy-anchor-image",
    imageLabel: "参照を画像としてコピー",
    imageNotice: "参照画像",
    pinId: "toggle-anchor-pin",
  },
} as const;

interface UseResListPopupMenuOptions {
  variant: keyof typeof MENU_VARIANTS;
  items: IRes[];
  /** 画像の見出しに使うポップアップのタイトル */
  title: string;
  threadTitle?: string;
  threadUrl?: string;
  pinned: boolean;
  onTogglePinned?: () => void;
}

/**
 * レス一覧を表示するポップアップ（ID・アンカー）のヘッダーメニュー項目を組み立てる。
 *
 * テキスト／画像コピーの経路（Clipboard コマンド、別窓の Document、テーマ、失敗通知）を
 * ここへ集め、ポップアップごとに同じ呼び出しを重複させない。
 */
export function useResListPopupMenu({
  variant,
  items,
  title,
  threadTitle,
  threadUrl,
  pinned,
  onTogglePinned,
}: UseResListPopupMenuOptions): ContextMenuItem[] {
  const viewSurface = useViewSurface();
  const toast = useToast();
  const theme = useTheme();
  const { document: viewDocument } = viewSurface;
  // 変更理由: ポップアップ固有のClipboard呼び出しをなくし、別窓でも
  // 同じ表示先とエラー通知を共有する。
  const runClipboardCommand = useCallback(
    (text: string) => {
      void runCommandRequest(
        { id: COMMAND_REQUEST_IDS.CLIPBOARD_COPY_TEXT, args: { text } },
        { surface: viewSurface, toast },
      );
    },
    [toast, viewSurface],
  );
  const labels = MENU_VARIANTS[variant];

  return [
    {
      id: labels.copyId,
      label: labels.copyLabel,
      icon: <Copy size={14} />,
      onSelect: () => runClipboardCommand(buildResListCopyText(items, threadTitle, threadUrl)),
    },
    {
      id: labels.imageId,
      label: labels.imageLabel,
      icon: <ImageIcon size={14} />,
      disabled: !canCopyImageToClipboard(viewSurface),
      onSelect: () => {
        void copyImageWithNotice(
          async () =>
            canvasToBlob(
              renderResponseListImageCanvas(items, {
                title,
                threadTitle,
                threadUrl,
                theme,
                targetDocument: viewDocument,
              }),
            ),
          viewSurface,
          toast,
          labels.imageNotice,
        );
      },
    },
    {
      id: labels.pinId,
      label: pinned ? "ピン留めを解除" : "ピン留め",
      icon: pinned ? <PinOff size={14} /> : <Pin size={14} />,
      onSelect: onTogglePinned,
    },
  ];
}
