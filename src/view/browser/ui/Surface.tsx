import type { HTMLAttributes, ReactNode } from "react";

export type SurfaceTone = "default" | "muted" | "danger";

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section";
  tone?: SurfaceTone;
}

/** 設定や補助パネルで共有する、枠・背景・余白のDOM契約。 */
export function Surface({
  as: Component = "section",
  className,
  tone = "default",
  ...props
}: SurfaceProps) {
  const classes = ["browser-surface", className].filter(Boolean).join(" ");

  return <Component {...props} className={classes} data-tone={tone} />;
}

export function SurfaceHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const classes = ["browser-surface__header", className].filter(Boolean).join(" ");

  return <div {...props} className={classes} />;
}

export function SurfaceTitle({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  const classes = ["browser-surface__title", className].filter(Boolean).join(" ");

  return (
    <h3 {...props} className={classes}>
      {children}
    </h3>
  );
}

export function SurfaceDescription({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  const classes = ["browser-surface__description", className].filter(Boolean).join(" ");

  return (
    <p {...props} className={classes}>
      {children}
    </p>
  );
}

export function SurfaceBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const classes = ["browser-surface__body", className].filter(Boolean).join(" ");

  return <div {...props} className={classes} />;
}

export function SurfaceActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const classes = ["browser-surface__actions", className].filter(Boolean).join(" ");

  return <div {...props} className={classes} />;
}

export function SurfaceStack({ children, className }: { children: ReactNode; className?: string }) {
  const classes = ["browser-surface-stack", className].filter(Boolean).join(" ");

  return <div className={classes}>{children}</div>;
}
