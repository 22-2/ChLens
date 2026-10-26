import { Button } from "./Button";

export default { title: "ChLens/共通UI/Button" };

export function Variants() {
  return (
    <div className="storybook-demo storybook-demo--stack">
      <Button>通常</Button>
      <Button variant="subtle">控えめ</Button>
      <Button variant="light">淡色</Button>
      <Button variant="danger">危険</Button>
      <Button loading>保存中</Button>
      <Button disabled>無効</Button>
    </div>
  );
}
