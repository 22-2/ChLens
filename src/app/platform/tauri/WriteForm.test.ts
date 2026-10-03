import { encodeWriteFields, encodeWriteForm } from "src/app/platform/tauri/WriteForm";
import { describe, expect, it } from "vite-plus/test";

describe("Tauri版の書き込みフォームエンコード", () => {
  it.each(["Shift_JIS", "EUC-JP"])(
    "%sで表現できない絵文字と結合文字を数値文字参照として送信する",
    (charset) => {
      const body = new TextDecoder().decode(
        encodeWriteForm({
          action: "https://example.com/test/bbs.cgi",
          charset,
          input: { NAME: "名無し😭", MAIL: "sage" },
          textarea: { MESSAGE: "日本語?😭❤️👩🏽‍💻\n&#128557;" },
        }),
      );

      // URLSearchParamsはUTF-8専用のため、各値を送信先の文字コードで復号して日本語も検証する。
      const fields = Object.fromEntries(
        body.split("&").map((field) => {
          const [name, value] = field.split("=");
          const bytes = Uint8Array.from(
            value
              .replace(/\+/g, " ")
              .replace(/%([\dA-F]{2})/g, (_, hex: string) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
              ),
            (character) => character.charCodeAt(0),
          );
          return [name, new TextDecoder(charset).decode(bytes)];
        }),
      );
      expect(fields.NAME).toBe("名無し&#128557;");
      expect(fields.MAIL).toBe("sage");
      expect(fields.MESSAGE).toBe(
        "日本語?&#128557;&#10084;&#65039;&#128105;&#127997;&#8205;&#128187;\r\n&#128557;",
      );
    },
  );

  it("UTF-8では絵文字を数値文字参照へ変えず送信する", () => {
    const body = new TextDecoder().decode(
      encodeWriteFields([{ name: "MESSAGE", value: "😭❤️👩🏽‍💻", type: "textarea" }], "UTF-8"),
    );
    expect(new URLSearchParams(body).get("MESSAGE")).toBe("😭❤️👩🏽‍💻");
  });

  it("確認フォームの再送信でも絵文字を保持し同名フィールドの順序を維持する", () => {
    const body = new TextDecoder().decode(
      encodeWriteFields(
        [
          { name: "MESSAGE", value: "😭\n次", type: "textarea" },
          { name: "token", value: "one", type: "input" },
          { name: "token", value: "two", type: "input" },
        ],
        "Shift_JIS",
      ),
    );
    expect(body).toBe("MESSAGE=%26%23128557%3B%0D%0A%8E%9F&token=one&token=two");
  });

  it("フォームの空白と改行をapplication/x-www-form-urlencodedへ変換する", () => {
    const body = new TextDecoder().decode(
      new Uint8Array(
        encodeWriteForm({
          action: "https://example.com/test/bbs.cgi",
          charset: "UTF-8",
          input: { NAME: "名無し" },
          textarea: { MESSAGE: "hello world\nnext" },
        }),
      ),
    );

    expect(body).toContain("NAME=%E5%90%8D%E7%84%A1%E3%81%97");
    expect(body).toContain("MESSAGE=hello+world%0D%0Anext");
  });

  it("確認フォーム用に同名フィールドを順序付きで保持する", () => {
    const body = new TextDecoder().decode(
      new Uint8Array(
        encodeWriteFields(
          [
            { name: "token", value: "one", type: "input" },
            { name: "token", value: "two", type: "input" },
          ],
          "UTF-8",
        ),
      ),
    );
    expect(body).toBe("token=one&token=two");
  });
});
