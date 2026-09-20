import { WriteCookieJar } from "src/app/platform/tauri/WriteCookies";
import { describe, expect, it } from "vite-plus/test";

describe("Tauri版の書き込みCookie", () => {
  it("同一の書き込み処理中だけSet-Cookieを次のPOSTへ引き継ぐ", () => {
    const jar = new WriteCookieJar();
    jar.updateFromResponse("https://example.com/test/bbs.cgi", [
      "MonaTicket=token=with-equals; Path=/; Secure",
      "scoped=value; Path=/test",
      "foreign=value; Domain=other.example.com; Path=/",
    ]);

    expect(jar.getHeader("https://example.com/test/bbs.cgi")).toBe(
      "scoped=value; MonaTicket=token=with-equals",
    );
    expect(jar.getHeader("https://example.com/other")).toBe("MonaTicket=token=with-equals");
    expect(jar.getHeader("http://example.com/test/bbs.cgi")).toBe("scoped=value");
  });

  it("Max-Age=0で指定されたCookieを削除し、jarの破棄後は送信しない", () => {
    const jar = new WriteCookieJar();
    jar.updateFromResponse("https://example.com/test/bbs.cgi", ["token=value; Path=/"]);
    jar.updateFromResponse("https://example.com/test/bbs.cgi", ["token=gone; Max-Age=0; Path=/"]);

    expect(jar.getHeader("https://example.com/test/bbs.cgi")).toBeUndefined();
    jar.updateFromResponse("https://example.com/test/bbs.cgi", ["token=value; Path=/"]);
    jar.clear();
    expect(jar.getHeader("https://example.com/test/bbs.cgi")).toBeUndefined();
  });
});
