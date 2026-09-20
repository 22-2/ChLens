import { encodeWriteFields, encodeWriteForm } from "src/app/platform/tauri/WriteForm";
import { describe, expect, it } from "vite-plus/test";

describe("Tauri版の書き込みフォームエンコード", () => {
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
