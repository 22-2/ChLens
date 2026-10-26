import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

export default { title: "ChLens/共通UI/Tooltip" };

export function Open() {
  return (
    <div className="storybook-demo storybook-demo--stack">
      <Tooltip label="この操作の説明です" open>
        <Button>説明を表示</Button>
      </Tooltip>
    </div>
  );
}
