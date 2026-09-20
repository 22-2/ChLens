import {
  createWriteRequestHeaders,
  encodeWriteFields,
  encodeWriteForm,
} from "src/app/platform/tauri/WriteForm";
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

  it("投稿先のOriginとRefererおよびブラウザUAをヘッダーへ設定する", () => {
    const headers = createWriteRequestHeaders("https://example.com/test/bbs.cgi", "");

    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers.Origin).toBe("https://example.com");
    expect(headers.Referer).toBe("https://example.com/test/bbs.cgi");
    expect(headers["User-Agent"]).toBe(navigator.userAgent);
  });

  it("確認フォーム用に同名フィールドとCookieおよびRefererを保持する", () => {
    const headers = createWriteRequestHeaders("https://example.com/test/bbs.cgi", "", {
      referer: "https://example.com/test/bbs.cgi?confirm=1",
      cookie: "MonaTicket=token; other=value",
    });

    expect(headers.Referer).toBe("https://example.com/test/bbs.cgi?confirm=1");
    expect(headers.Cookie).toBe("MonaTicket=token; other=value");

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

  it("利用者が設定したUser-AgentをブラウザUAより優先する", () => {
    const headers = createWriteRequestHeaders(
      "https://example.com/test/bbs.cgi",
      "CustomBrowser/1.0",
    );

    expect(headers["User-Agent"]).toBe("CustomBrowser/1.0");
  });
});
