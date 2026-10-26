import { Button } from "./Button";
import { Popover } from "./Popover";

export default { title: "ChLens/共通UI/Popover" };

export function Open() {
  return (
    <div className="storybook-demo">
      <Popover.Root defaultOpen>
        <Popover.Trigger asChild>
          <Button variant="subtle">絞り込み</Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="storybook-popover-content" sideOffset={8}>
            <strong>表示するレス</strong>
            <p>条件を選ぶと、一覧に表示するレスを絞り込めます。</p>
            <Popover.Arrow />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
