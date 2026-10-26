import { Button } from "./Button";
import { Dialog } from "./Dialog";

export default { title: "ChLens/共通UI/Dialog" };

export function Open() {
  return (
    <div className="storybook-demo">
      <Dialog.Root defaultOpen>
        <Dialog.Portal>
          <Dialog.Overlay className="browser-dialog-overlay" />
          <Dialog.Content className="browser-dialog-content">
            <Dialog.Title className="browser-dialog-title">設定を保存しますか？</Dialog.Title>
            <Dialog.Description className="browser-dialog-description">
              変更した表示設定を保存します。
            </Dialog.Description>
            <div className="browser-surface__actions">
              <Dialog.Close asChild>
                <Button>保存</Button>
              </Dialog.Close>
              <Dialog.Close asChild>
                <Button variant="subtle">キャンセル</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
