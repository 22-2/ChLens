import { Alert } from "./Alert";

export default { title: "ChLens/共通UI/Alert" };

export function Variants() {
  return (
    <div className="storybook-demo storybook-demo--narrow">
      <div className="storybook-demo--stack">
        <Alert title="情報" variant="info">
          設定を保存しました。
        </Alert>
        <Alert title="確認" variant="neutral">
          現在の設定を確認してください。
        </Alert>
        <Alert title="注意" variant="warning">
          この操作は取り消せません。
        </Alert>
        <Alert title="失敗" variant="danger">
          データを読み込めませんでした。
        </Alert>
      </div>
    </div>
  );
}
