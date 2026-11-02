import { describe, expect, it } from "vite-plus/test";

import { parseBoardResponseLimit } from "./BoardResponseLimit";

describe("板設定のレス上限", () => {
  it("2ch互換板としたらばの設定から上限を読む", () => {
    expect(parseBoardResponseLimit("BBS_TITLE=テスト\r\nBBS_RES_MAX=3000\r\n", "setting")).toBe(
      3000,
    );
    expect(parseBoardResponseLimit("BBS_THREAD_STOP=5000\n", "jbbs")).toBe(5000);
  });
  it.each([
    "",
    "BBS_RES_MAX=0",
    "BBS_RES_MAX=-1",
    "BBS_RES_MAX=3000abc",
    "BBS_RES_MAX=999999999999999999999",
  ])("不明または不正な値 %s は推測しない", (value) => {
    expect(parseBoardResponseLimit(value, "setting")).toBeNull();
  });
});
