import { Accordion } from "./Accordion";

export default { title: "ChLens/共通UI/Accordion" };

export function Expanded() {
  return (
    <div className="storybook-demo storybook-demo--narrow">
      <Accordion.Root type="single" collapsible defaultValue="display">
        <Accordion.Item value="display" className="storybook-accordion">
          <Accordion.Header className="storybook-accordion__header">
            <Accordion.Trigger className="storybook-accordion__trigger">表示設定</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="storybook-accordion__content">
            <p>レス一覧の表示や、テーマに関する設定をここにまとめます。</p>
          </Accordion.Content>
        </Accordion.Item>
        <Accordion.Item value="network" className="storybook-accordion">
          <Accordion.Header className="storybook-accordion__header">
            <Accordion.Trigger className="storybook-accordion__trigger">通信設定</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="storybook-accordion__content">
            <p>通信や取得動作に関する設定をここにまとめます。</p>
          </Accordion.Content>
        </Accordion.Item>
      </Accordion.Root>
    </div>
  );
}
