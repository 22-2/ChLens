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

  it("ひらがなとカタカナを区別せずに強調する", () => {
    expect(findSearchMatchRanges("ぎゃくギャク", "ギャク")).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
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

  it("全角半角を区別せず、半角カナの濁点を含む一致を元の文字の範囲で返す", () => {
    expect(findSearchMatchRanges("ｶﾞｯﾂﾎﾟｰｽﾞ!", "ガッツ")).toEqual([{ start: 0, end: 4 }]);
    expect(findSearchMatchRanges("ＡＢＣ", "abc")).toEqual([{ start: 0, end: 3 }]);
  });

  it("指定したクラスで強調し、現在の一致だけに別のクラスを足す", () => {
    const result = highlightSearchMatches("foo <b>foo</b> foo", "FOO", {
      className: "res__find-match",
      activeIndex: 1,
      activeClassName: "res__find-match--current",
    });
    const document = new DOMParser().parseFromString(result, "text/html");
    const marks = [...document.querySelectorAll("mark.res__find-match")];

    expect(marks).toHaveLength(3);
    expect(marks.map((mark) => mark.classList.contains("res__find-match--current"))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("検索フィルタの強調の中にある文字も、ページ内検索の一致として数える", () => {
    const filtered = highlightSearchMatches("abc", "b");
    const result = highlightSearchMatches(filtered, "abc", { className: "res__find-match" });
    const document = new DOMParser().parseFromString(result, "text/html");

    expect(
      [...document.querySelectorAll("mark.res__find-match")].map((mark) => mark.textContent),
    ).toEqual(["a", "b", "c"]);
  });
});
