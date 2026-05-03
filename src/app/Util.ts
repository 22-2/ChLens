export { default as escapeHtml } from "escape-html";

export function deepCopy<T>(src: T): T {
  return window.structuredClone(src);
}

export function replaceAll(str: string, before: string, after: string): string {
  return str.replaceAll(before, after);
}

export function safeHref(url: string): string {
  return /^https?:\/\//.test(url) ? url : "/view/empty.html";
}
