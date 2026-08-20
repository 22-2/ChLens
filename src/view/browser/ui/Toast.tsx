import { Toast as RadixToast } from "radix-ui";
import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import { toastStore } from "src/service-container/toast-store";

interface ToastProviderProps {
  topOffset: string;
  rightOffset: string;
  duration?: number;
}

/** Radix Toastと外部発火用ストアを接続する、browser view共通の通知UI。 */
export function ToastProvider({ topOffset, rightOffset, duration = 1500 }: ToastProviderProps) {
  const records = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getSnapshot,
  );
  const viewportStyle = {
    "--cmp-toast-offset-top": topOffset,
    "--cmp-toast-offset-right": rightOffset,
  } as CSSProperties;

  return (
    <RadixToast.Provider duration={duration} label="通知">
      {records.map((record) => (
        <RadixToast.Root
          key={record.id}
          className="browser-toast"
          data-kind={record.kind}
          onOpenChange={(open) => {
            if (!open) {
              toastStore.dismiss(record.id);
            }
          }}
          style={
            record.backgroundColor
              ? ({ "--cmp-toast-background": record.backgroundColor } as CSSProperties)
              : undefined
          }
        >
          <RadixToast.Title className="browser-toast__title">{record.message}</RadixToast.Title>
          <RadixToast.Close className="browser-toast__close" aria-label="通知を閉じる">
            ×
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="browser-toast-viewport" style={viewportStyle} />
    </RadixToast.Provider>
  );
}
