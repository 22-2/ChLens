import {
  formatIdForCopy,
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
});
