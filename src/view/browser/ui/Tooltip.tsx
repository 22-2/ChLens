import { Tooltip as RadixTooltip } from "radix-ui";
import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

type TooltipSide = "top" | "right" | "bottom" | "left";

export interface TooltipProps {
  children: ReactElement;
  label: ReactNode;
  disabled?: boolean;
  open?: boolean;
  position?: TooltipSide;
  offset?: number;
  zIndex?: CSSProperties["zIndex"];
}

const TooltipScopeContext = createContext(false);

/**
 * アプリ全体でTooltipの遅延とPortal挙動を揃える。単体テストや小さな埋め込みでも
 * providerを付け忘れて壊れないよう、Tooltip側にはローカルfallbackを持たせる。
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipScopeContext.Provider value>
      <RadixTooltip.Provider delayDuration={300} skipDelayDuration={300}>
        {children}
      </RadixTooltip.Provider>
    </TooltipScopeContext.Provider>
  );
}

export function Tooltip({
  children,
  label,
  disabled = false,
  open,
  position = "top",
  offset = 4,
  zIndex,
}: TooltipProps) {
  const hasProvider = useContext(TooltipScopeContext);

  // disabled時もTriggerのDOMを維持する。状態遷移でcanvasやtable rowを差し替えると、
  // pointer captureや仮想スクロールの参照が切れてしまうため、openだけを閉じる。
  const isDisabled = disabled || label == null || label === "";

  const content = (
    <RadixTooltip.Root open={isDisabled ? false : open}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className="browser-tooltip"
          side={position}
          sideOffset={offset}
          style={zIndex === undefined ? undefined : { zIndex }}
          role="tooltip"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );

  return hasProvider ? content : <TooltipProvider>{content}</TooltipProvider>;
}
