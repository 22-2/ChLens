import { Accordion as RadixAccordion } from "radix-ui";

/** Radix Accordionの部品をfeature CSSへ渡す薄い名前空間。業務状態は各画面が所有する。 */
export const Accordion = {
  Root: RadixAccordion.Root,
  Item: RadixAccordion.Item,
  Header: RadixAccordion.Header,
  Trigger: RadixAccordion.Trigger,
  Content: RadixAccordion.Content,
};
