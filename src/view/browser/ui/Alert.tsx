import type { HTMLAttributes, ReactNode } from "react";

export type AlertVariant = "danger" | "neutral" | "warning" | "info";

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  icon?: ReactNode;
  color?: "red" | "gray" | "yellow" | "blue";
  variant?: AlertVariant;
}

/** 表示専用の通知surface。色はsemantic variantへ変換し、raw paletteを呼び出し側へ漏らさない。 */
export function Alert({
  className,
  title,
  icon,
  color,
  variant = color === "red"
    ? "danger"
    : color === "yellow"
      ? "warning"
      : color === "blue"
        ? "info"
        : "neutral",
  children,
  ...props
}: AlertProps) {
  const classes = ["browser-alert", className].filter(Boolean).join(" ");

  return (
    <div {...props} className={classes} data-variant={variant} role="alert">
      {icon ? <span className="browser-alert__icon">{icon}</span> : null}
      <div className="browser-alert__body">
        {title ? <div className="browser-alert__title">{title}</div> : null}
        <div className="browser-alert__content">{children}</div>
      </div>
    </div>
  );
}
