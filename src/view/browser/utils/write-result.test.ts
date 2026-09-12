import {
  classifyWriteResult,
  resolveWriteSuccessDelayMsFromRefresh,
} from "src/view/browser/utils/write-result";
import { describe, expect, it } from "vite-plus/test";

describe("書き込み結果の判定", () => {
  it("成功ページとmeta refreshの待機時間を判定する", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "書きこみました",
        refreshContent: "3;URL=example.com",
      }),
    ).toEqual({ type: "success", message: 3000 });
  });

  it("確認ページを判定する", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "書き込み確認",
      }),
    ).toEqual({ type: "confirm" });
  });

  it("エラー本文を判定する", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "ERROR: 投稿できません",
      }),
    ).toEqual({ type: "error", message: "ERROR: 投稿できません" });
  });

  it("書き込み結果以外のURLを無視する", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/read.cgi/software/1/",
        title: "書きこみました",
      }),
    ).toBeNull();
  });

  it("不正なmeta refreshを待機時間へ変換しない", () => {
    expect(resolveWriteSuccessDelayMsFromRefresh("not-a-delay")).toBeUndefined();
  });
});
