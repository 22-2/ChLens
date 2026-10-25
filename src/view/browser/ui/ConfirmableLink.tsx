import type { AnchorHTMLAttributes, MouseEventHandler } from "react";
import { useConfigBooleanSetting } from "src/view/browser/hooks/use-config-boolean-setting";
import { useExternalLinkMenu } from "src/view/browser/hooks/use-external-link-menu";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { requestExternalLink } from "src/view/browser/utils/external-link";
import { EXTERNAL_LINK_CONFIRM_CONFIG_KEY } from "src/view/browser/utils/external-link-analysis";

type Props = Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "target" | "rel" | "className" | "style" | "title" | "children" | "aria-label"
> & {
  onClick?: MouseEventHandler<HTMLElement>;
  onMouseDown?: MouseEventHandler<HTMLElement>;
  onAuxClick?: MouseEventHandler<HTMLElement>;
};

/** ON時だけ実URLを持たないボタンへ変え、標準リンクメニューによる確認迂回をなくす。 */
export function ConfirmableLink({
  href = "",
  target,
  rel,
  className,
  onClick,
  onMouseDown,
  onAuxClick,
  children,
  ...props
}: Props) {
  const { value: enabled } = useConfigBooleanSetting(EXTERNAL_LINK_CONFIRM_CONFIG_KEY);
  const surface = useViewSurface();
  const { menu, openMenu } = useExternalLinkMenu();
  if (!enabled) {
    return (
      <a
        {...props}
        href={href}
        target={target}
        rel={rel}
        className={className}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onAuxClick={onAuxClick}
      >
        {children}
      </a>
    );
  }
  return (
    <>
      <button
        {...props}
        type="button"
        className={["external-link-button", className].filter(Boolean).join(" ")}
        title={props.title ?? href}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (onClick && !event.ctrlKey && !event.metaKey && !event.shiftKey) onClick(event);
          else
            requestExternalLink(href, {
              sourceWindow: surface.window,
              active: !(event.ctrlKey || event.metaKey),
              newWindow: event.shiftKey,
            });
        }}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
          onMouseDown?.(event);
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          if (onAuxClick) onAuxClick(event);
          else requestExternalLink(href, { sourceWindow: surface.window, active: false });
        }}
        onContextMenu={(event) => openMenu(href, event)}
      >
        {children}
      </button>
      {enabled && menu}
    </>
  );
}
