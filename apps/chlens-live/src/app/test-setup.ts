import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

// Reactコンポーネントテスト間でDOMを復元しないと、複数テストで同じ要素が重複検出される。
afterEach(() => {
  cleanup();
});

// jsdomはscrollIntoViewを持たないため、新着追従の自動スクロールをスタブする。
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
