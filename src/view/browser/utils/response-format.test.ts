import "@testing-library/jest-dom/vitest";
import {
  formatIdForCopy,
  formatResForCopy,
  normalizeIdLinkText,
  stripHtml,
} from "src/view/browser/utils/response-format";
import { describe, expect, it } from "vite-plus/test";

describe("response-format", () => {
  it("stripHtml は数値文字参照の絵文字を復元する", () => {
    expect(stripHtml("<span>&#128514;</span><br>&amp;test")).toBe("😂\n&test");
  });

  it("anchor_id の表示文字列をIDポップアップ向けに正規化する", () => {
    expect(normalizeIdLinkText("id:ABC123(4)")).toBe("ID:ABC123");
  });

  it("コピー用IDをID:形式へ正規化する", () => {
    expect(formatIdForCopy("abc123")).toBe("ID:abc123");
    expect(formatIdForCopy("id:ABC123")).toBe("ID:ABC123");
    expect(formatIdForCopy(undefined)).toBe("");
  });

  it("レスのコピー形式にIDを含める", () => {
    expect(
      formatResForCopy({
        num: 10,
        name: "name",
        mail: "",
        date: "date",
        id: "abc123",
        message: "message",
      }),
    ).toBe("10 name ID:abc123  date\nmessage");
  });

  it("レス本文の先頭に混入した通常スペースを1文字だけ除去する", () => {
    expect(
      formatResForCopy({
        num: 10,
        name: "name",
        mail: "",
        date: "date",
        message: " message",
      }),
    ).toBe("10 name  date\nmessage");
    expect(
      formatResForCopy({
        num: 11,
        name: "name",
        mail: "",
        date: "date",
        message: "  indented message",
      }),
    ).toBe("11 name  date\n indented message");
  });
});
