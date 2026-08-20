import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "subtle" | "light";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** 見た目とvariantだけを共通化する薄いbutton。業務ロジックは持たない。 */
export function Button({ className, variant = "default", type = "button", ...props }: ButtonProps) {
  const classes = ["browser-button", className].filter(Boolean).join(" ");

  return <button {...props} className={classes} data-variant={variant} type={type} />;
}
