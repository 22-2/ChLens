import {
  formatIdForCopy,
  formatMarkdownLink,
  parseAnchorDisplayTargets,
  toViewerImageUrl,
} from "src/view/browser/utils/utils";
import { describe, expect, it } from "vite-plus/test";

describe("utils compatibility entrypoint", () => {
  it("責務別モジュールの公開APIを従来のimport先から利用できる", () => {
    expect(formatIdForCopy("abc123")).toBe("ID:abc123");
    expect(parseAnchorDisplayTargets(">>10")).toEqual([10]);
    expect(toViewerImageUrl("https://imgur.com/TestImage")).toBe(
      "https://i.imgur.com/TestImagem.jpg",
    );
  });

  it("MarkdownリンクのタイトルとURLに含まれる構文文字をエスケープする", () => {
    expect(formatMarkdownLink("Title ] \\ note", "https://example.test/thread/(1)?next=2)")).toBe(
      "[Title \\] \\\\ note](https://example.test/thread/\\(1\\)?next=2\\))",
    );
  });
});
