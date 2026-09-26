import { findWriteWarnings } from "src/view/browser/utils/write-warning";
import { describe, expect, it } from "vite-plus/test";

describe("投稿前の警告検出", () => {
  it.each([
    ["メールアドレス", "連絡先は sample.user+reply@example.com です", "メールアドレス"],
    ["国内の電話番号", "連絡先は 03-1234-5678 です", "電話番号"],
    ["国番号付きの電話番号", "連絡先は +81-90-1234-5678 です", "電話番号"],
    ["プラスなしの国番号付き電話番号", "連絡先は 81-90-1234-5678 です", "電話番号"],
    ["ハイフンなしの国番号付き電話番号", "連絡先は +819012345678 です", "電話番号"],
    ["ハイフンなしの電話番号", "連絡先は 09012345678 です", "電話番号"],
    ["ハイフン付き郵便番号", "住所は〒123-4567です", "住所・郵便番号"],
    ["全角ハイフン付き郵便番号", "住所は123ー4567です", "住所・郵便番号"],
    ["空白区切りの郵便番号", "住所は123 4567です", "住所・郵便番号"],
    ["区切りなしの郵便番号", "郵便番号は1234567です", "住所・郵便番号"],
    ["都道府県から始まる住所", "東京都新宿区1丁目", "住所・郵便番号"],
    ["北海道から始まる住所", "北海道札幌市中央区1条", "住所・郵便番号"],
    ["Windowsのユーザーフォルダー", "C:\\Users\\sample\\Documents\\draft.txt", "ファイルパス"],
    [
      "旧形式のWindowsユーザーフォルダー",
      "C:\\Documents and Settings\\sample\\draft.txt",
      "ファイルパス",
    ],
    ["日本語のWindowsユーザーフォルダー", "C:\\ユーザー\\sample\\draft.txt", "ファイルパス"],
    ["Unixのホームフォルダー", "設定ファイルは /home/sample/app.conf にあります", "ファイルパス"],
    [
      "macOSのユーザーフォルダー",
      "設定ファイルは /Users/sample/app.conf にあります",
      "ファイルパス",
    ],
    ["UNCパス", "\\\\server\\share\\private.txt", "ファイルパス"],
    ["IPアドレス", "接続先は192.0.2.10です", "IPアドレス"],
    ["パスワード表記", "password: example-secret", "パスワード・認証情報"],
    ["passwd表記", "passwd=example-secret", "パスワード・認証情報"],
    ["日本語のパスワード表記", "パスワード：example-secret", "パスワード・認証情報"],
    ["日本語のAPIキー表記", "api_key=example-secret", "パスワード・認証情報"],
    ["ハイフン区切りのAPIキー表記", "api-key: example-secret", "パスワード・認証情報"],
    ["アクセストークン表記", "access token=example-secret", "パスワード・認証情報"],
    ["秘密鍵の表記", "秘密鍵：example-secret", "パスワード・認証情報"],
    ["危害を示す表現", "殺すぞ", "脅迫・危害を示す表現"],
    ["殺害予告", "殺害予告をする", "脅迫・危害を示す表現"],
    ["殺害を示す表現", "殺してやる", "脅迫・危害を示す表現"],
    ["爆破予告", "爆破予告をする", "脅迫・危害を示す表現"],
    ["爆破を示す表現", "爆破してやる", "脅迫・危害を示す表現"],
    ["爆弾を仕掛ける表現", "爆弾を仕掛ける", "脅迫・危害を示す表現"],
    ["襲撃予告", "襲撃予告をする", "脅迫・危害を示す表現"],
  ])("%sを検出する", (_label, text, category) => {
    expect(findWriteWarnings([text]).map((warning) => warning.category)).toContain(category);
  });

  it.each([
    ["通常の文章", "今日は天気がよくて気持ちいい"],
    ["短い数字", "今日は1234番の電車に乗った"],
    ["英数字に埋め込まれた7桁", "管理番号abc1234567def"],
    ["認証トークンに含まれる7桁", "#000673c0853dd270247921bf12109000"],
    ["範囲外のIPアドレス", "接続先は999.999.999.999です"],
  ])("%sでは警告しない", (_label, text) => {
    // 変更理由: 英数字識別子の部分文字列を個人情報と誤認しないことを回帰防止する。
    expect(findWriteWarnings([text])).toEqual([]);
  });

  it("名前・メール欄・本文をまとめて走査し、異なる警告を重複なく返す", () => {
    const warnings = findWriteWarnings([
      "sample.user@example.com",
      "090-1234-5678",
      "東京都新宿区1丁目",
    ]);

    expect(warnings.map((warning) => warning.category)).toEqual([
      "メールアドレス",
      "電話番号",
      "住所・郵便番号",
    ]);
    expect(warnings.every((warning) => warning.reason.length > 0)).toBe(true);
  });

  it("複数の個人情報カテゴリが1つの入力に含まれる場合も各警告を返す", () => {
    const warnings = findWriteWarnings(["sample.user@example.com 〒123-4567"]);

    expect(warnings.map((warning) => warning.category)).toEqual([
      "メールアドレス",
      "住所・郵便番号",
    ]);
  });
});
