import { Spinner } from "./Spinner";

export default { title: "ChLens/共通UI/Spinner" };

export function Sizes() {
  return (
    <div className="storybook-demo storybook-demo--stack">
      <Spinner size="xs" aria-label="小" />
      <Spinner size="sm" aria-label="標準" />
      <Spinner size="lg" aria-label="大" />
    </div>
  );
}
