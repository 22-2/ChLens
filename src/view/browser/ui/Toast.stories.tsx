import { toastStore } from "src/service-container/toast-store";

import { Button } from "./Button";
import { ToastProvider } from "./Toast";

export default { title: "ChLens/共通UI/Toast" };

export function Notifications() {
  return (
    <div className="storybook-demo storybook-demo--stack">
      <ToastProvider topOffset="var(--sys-space-8)" rightOffset="var(--sys-space-8)" />
      <Button onClick={() => toastStore.success("設定を保存しました")}>成功通知</Button>
      <Button variant="subtle" onClick={() => toastStore.info("新着レスを取得しました")}>
        情報通知
      </Button>
      <Button variant="danger" onClick={() => toastStore.error("更新に失敗しました")}>
        エラー通知
      </Button>
    </div>
  );
}
