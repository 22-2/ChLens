import {
  findSearchMatchRanges,
  highlightSearchMatches,
} from "src/view/browser/utils/search-highlight";
import { describe, expect, it } from "vite-plus/test";

describe("search highlight", () => {
  it("空の検索語では元のHTMLを変更しない", () => {
    const html = '<a class="anchor">&gt;&gt;5</a>';

    expect(highlightSearchMatches(html, "")).toBe(html);
  });

  it("大小文字を無視して複数の一致箇所を強調する", () => {
    const html = "Foo and foo";

    const result = highlightSearchMatches(html, "FOO");
    const document = new DOMParser().parseFromString(result, "text/html");

    expect(document.querySelectorAll("mark.res__search-match")).toHaveLength(2);
    expect([...document.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual([
      "Foo",
      "foo",
    ]);
  });

  it("文字参照と日本語を表示後の文字列として強調する", () => {
    const result = highlightSearchMatches("A &amp; 日本語", "& 日本語");

    expect(result).toContain('class="res__search-match"');
    expect(findSearchMatchRanges("A & 日本語", "& 日本語")).toEqual([{ start: 2, end: 7 }]);
  });

  it("リンクとレスアンカーの要素を維持したままラベルだけを強調する", () => {
    const html = '<a href="https://example.com">Foo</a> <a class="anchor">&gt;&gt;5</a>';

    const result = highlightSearchMatches(html, ">>5");
    const document = new DOMParser().parseFromString(result, "text/html");
    const link = document.querySelector('a[href="https://example.com"]');
    const anchor = document.querySelector("a.anchor");

    expect(link).not.toBeNull();
    expect(link?.querySelector("mark")).toBeNull();
    expect(anchor?.querySelector("mark")?.textContent).toBe(">>5");
    expect(anchor?.textContent).toBe(">>5");
  });

  it("HTML要素をまたぐ一致も各テキストノード内で強調する", () => {
    const result = highlightSearchMatches("<strong>Fo</strong>o", "FOO");
    const document = new DOMParser().parseFromString(result, "text/html");

    expect(document.querySelector("strong mark")?.textContent).toBe("Fo");
    expect(document.querySelector("body > mark")?.textContent).toBe("o");
    expect(document.body.textContent).toBe("Foo");
  });
});
