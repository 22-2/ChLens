import { Button } from "./Button";
import {
  Surface,
  SurfaceActions,
  SurfaceBody,
  SurfaceDescription,
  SurfaceHeader,
  SurfaceStack,
  SurfaceTitle,
} from "./Surface";

export default { title: "ChLens/共通UI/Surface" };

export function Variants() {
  return (
    <div className="storybook-demo storybook-demo--narrow">
      <SurfaceStack>
        <Surface>
          <SurfaceHeader>
            <SurfaceTitle>標準カード</SurfaceTitle>
            <SurfaceDescription>設定項目をまとめるカードです。</SurfaceDescription>
          </SurfaceHeader>
          <SurfaceBody>内容と操作をひとまとまりにできます。</SurfaceBody>
          <SurfaceActions>
            <Button>保存</Button>
            <Button variant="subtle">キャンセル</Button>
          </SurfaceActions>
        </Surface>
        <Surface tone="muted">
          <SurfaceTitle>補足情報</SurfaceTitle>
          <SurfaceBody>控えめな背景のカードです。</SurfaceBody>
        </Surface>
        <Surface tone="danger">
          <SurfaceTitle>削除の確認</SurfaceTitle>
          <SurfaceBody>危険な操作に関する説明を表示します。</SurfaceBody>
        </Surface>
        <Surface variant="flat">
          <SurfaceTitle>フラット</SurfaceTitle>
          <SurfaceBody>親カード内の補助セクションに使います。</SurfaceBody>
        </Surface>
      </SurfaceStack>
    </div>
  );
}
