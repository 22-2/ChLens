import { Dialog as RadixDialog } from "radix-ui";

/** Radix Dialogの部品を共通UI namespaceへ閉じ込める。 */
export const Dialog = {
  Root: RadixDialog.Root,
  Trigger: RadixDialog.Trigger,
  Portal: RadixDialog.Portal,
  Overlay: RadixDialog.Overlay,
  Content: RadixDialog.Content,
  Title: RadixDialog.Title,
  Description: RadixDialog.Description,
  Close: RadixDialog.Close,
};
