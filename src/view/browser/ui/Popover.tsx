import { Popover as RadixPopover } from "radix-ui";

/** Radix Popoverの部品を共通UI namespaceへ閉じ込める。 */
export const Popover = {
  Root: RadixPopover.Root,
  Anchor: RadixPopover.Anchor,
  Trigger: RadixPopover.Trigger,
  Portal: RadixPopover.Portal,
  Content: RadixPopover.Content,
  Close: RadixPopover.Close,
  Arrow: RadixPopover.Arrow,
};
