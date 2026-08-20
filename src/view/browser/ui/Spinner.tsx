import type { HTMLAttributes } from "react";

export type SpinnerSize = "xs" | "sm" | "lg";

export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  size?: SpinnerSize;
}

/**
 * 軽量な読み込み表示。Mantine Loaderの見た目に依存せず、既存のsemantic tokenだけで描画する。
 */
export function Spinner({ className, size = "sm", ...props }: SpinnerProps) {
  const classes = ["browser-spinner", className].filter(Boolean).join(" ");

  return <span {...props} className={classes} data-size={size} role={props.role ?? "status"} />;
}
