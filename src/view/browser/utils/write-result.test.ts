// @vitest-environment node
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

  it("日本語だけの書き込みエラー本文を判定する", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "書き込みエラー",
      }),
    ).toEqual({ type: "error", message: "書き込みエラー" });
  });

  it("エラーのタイトルより本文の拒否理由を優先する", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "ＥＲＲＯＲ",
        bodyText: "ＥＲＲＯＲ\nエラー！\n認証の有効期限が切れています\n再認証してください",
      }),
    ).toEqual({ type: "error", message: "認証の有効期限が切れています\n再認証してください" });
  });

  it("確認を促すエラー本文を確認フォームと誤判定しない", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "ＥＲＲＯＲ",
        bodyText: "ERROR: 投稿内容を確認してください",
      }),
    ).toEqual({ type: "error", message: "ERROR: 投稿内容を確認してください" });
  });

  it("改行のない本文でもfont内の拒否理由を取得する", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "ＥＲＲＯＲ",
        bodyText: "エラー！認証が失効しています戻る",
        fontText: "認証が失効しています",
      }),
    ).toEqual({ type: "error", message: "認証が失効しています" });
  });

  it("未認証レスポンスからeddibbの認証コードと認証URLを取り出す", () => {
    expect(
      classifyWriteResult({
        url: "https://example.com/test/bbs.cgi",
        title: "ＥＲＲＯＲ",
        bodyText: "エラー！\n認証コード'332376'を用いてください\nhttps://example.com/auth-code",
        errorCode: "E-Unauthenticated",
      }),
    ).toEqual({ type: "auth-code", code: "332376", url: "https://example.com/auth-code" });
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
