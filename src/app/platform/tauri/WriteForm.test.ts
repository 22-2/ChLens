import { createWriteRequestHeaders, encodeWriteForm } from "src/app/platform/tauri/WriteForm";
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

  it("利用者が設定したUser-AgentをブラウザUAより優先する", () => {
    const headers = createWriteRequestHeaders(
      "https://example.com/test/bbs.cgi",
      "CustomBrowser/1.0",
    );

    expect(headers["User-Agent"]).toBe("CustomBrowser/1.0");
  });
});
