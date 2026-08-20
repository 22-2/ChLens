import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "src/view/browser/ui/Spinner";

export type ButtonVariant = "default" | "subtle" | "light" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

/** 見た目とvariantだけを共通化する薄いbutton。業務ロジックは持たない。 */
export function Button({
  children,
  className,
  disabled,
  loading = false,
  variant = "default",
  type = "button",
  ...props
}: ButtonProps) {
  const classes = ["browser-button", className].filter(Boolean).join(" ");

  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={classes}
      data-variant={variant}
      disabled={disabled || loading}
      type={type}
    >
      {loading ? <Spinner size="xs" aria-label="処理中" /> : null}
      {children}
    </button>
  );
}
