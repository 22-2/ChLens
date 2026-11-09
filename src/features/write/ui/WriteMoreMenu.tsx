import { Clipboard, ExternalLink, ImagePlus, MoreVertical, Settings } from "lucide-react";
import React from "react";
import { Popover } from "src/view/browser/ui/Popover";

interface WriteMoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement;
  /** 送信中・Imgurアップロード中は、操作を受け付けない。 */
  busy: boolean;
  /** 投稿先のスレが無い間は、Imgur投稿を選べないようにする。 */
  hasThread: boolean;
  /** 別窓の編集欄では、別窓で開く項目を出さない。 */
  canOpenWriteWindow: boolean;
  onOpenSettings: () => void;
  onOpenWriteWindow: () => void;
  onPickLocalImage: () => void;
  onPasteClipboardImage: () => void;
}

/** 本文欄の右上にある「その他の操作」メニュー（書き込み設定、別窓、Imgur投稿）。 */
export const WriteMoreMenu: React.FC<WriteMoreMenuProps> = ({
  open,
  onOpenChange,
  container,
  busy,
  hasThread,
  canOpenWriteWindow,
  onOpenSettings,
  onOpenWriteWindow,
  onPickLocalImage,
  onPasteClipboardImage,
}) => {
  // 項目を選んだらメニューを閉じてから操作を実行する。
  const select = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="write-panel__menu-trigger"
          aria-label="その他の操作"
          title="その他の操作"
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      {/* パネル外へ表示し、狭い画面では表示位置を自動調整する。 */}
      <Popover.Portal container={container}>
        <Popover.Content
          className="write-panel__menu-items"
          side="top"
          align="end"
          sideOffset={4}
          collisionPadding={8}
        >
          <button
            type="button"
            className="write-panel__menu-item"
            onClick={select(onOpenSettings)}
            disabled={busy}
          >
            <Settings size={14} aria-hidden="true" />
            <span>書き込み設定</span>
          </button>
          {canOpenWriteWindow && (
            <button
              type="button"
              className="write-panel__menu-item"
              onClick={select(onOpenWriteWindow)}
              disabled={busy}
            >
              <ExternalLink size={14} aria-hidden="true" />
              <span>書き込みを別窓で開く</span>
            </button>
          )}
          <button
            type="button"
            className="write-panel__menu-item"
            onClick={select(onPickLocalImage)}
            disabled={busy || !hasThread}
          >
            <ImagePlus size={14} aria-hidden="true" />
            <span>ローカル画像をImgurに投稿</span>
          </button>
          <button
            type="button"
            className="write-panel__menu-item"
            onClick={select(onPasteClipboardImage)}
            disabled={busy || !hasThread}
          >
            <Clipboard size={14} aria-hidden="true" />
            <span>クリップボード画像をImgurに投稿</span>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
