import { type RefObject, useLayoutEffect } from "react";
import { getResizeObserverForWindow } from "src/view/browser/utils/dom";

/**
 * 入力・折り返しに合わせて、本文欄を1行から20行まで伸ばす。それ以上は欄内をスクロールする。
 * 本文や状態が変わったとき、および横幅の変化で改行位置だけが変わったときに高さを測り直す。
 */
export function useWriteTextareaAutosize(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  viewWindow: Window,
  deps: { message: string; status: string },
): void {
  const { message, status } = deps;
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const resize = () => {
      const style = viewWindow.getComputedStyle(textarea);
      const lineHeight =
        Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.4;
      const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      const border =
        Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth);
      // 測定のために一瞬縮めると親の行ごとパネルが縮み、スレの追従が外れるため、行の高さを保つ。
      const row = textarea.parentElement;
      if (row) row.style.minHeight = `${row.offsetHeight}px`;
      textarea.style.height = "0px";
      textarea.style.height = `${Math.min(textarea.scrollHeight + border, lineHeight * 20 + padding + border)}px`;
      if (row) row.style.minHeight = "";
    };
    resize();
    // 横幅が変わって改行位置だけが変わる場合も高さを更新する。
    const ResizeObserverConstructor = getResizeObserverForWindow(viewWindow);
    const observer = ResizeObserverConstructor ? new ResizeObserverConstructor(resize) : null;
    if (textarea.parentElement) observer?.observe(textarea.parentElement);
    return () => observer?.disconnect();
  }, [message, status, textareaRef, viewWindow]);
}
