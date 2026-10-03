import { describe, expect, it } from "vite-plus/test";

import { isTargetContentScriptUrl, normalizeContentScriptTargetUrl } from "./contentScriptTarget";
import { HOSTNAME } from "./hosts";

function urlWithHost(hostname: string, path: string): string {
  const url = new URL(`https://example.com${path}`);
  url.hostname = hostname;
  return url.href;
}

describe("content script対象URLの判定", () => {
  it("既知の掲示板形式だけを対象にし、互換ホストでも対象外パスを除く", () => {
    expect(
      isTargetContentScriptUrl(urlWithHost(`server.${HOSTNAME.NEW_5CH}`, "/sample-board/")),
    ).toBe(true);
    expect(isTargetContentScriptUrl(urlWithHost(HOSTNAME.EDDIBB, "/sample-board/123/"))).toBe(true);
    expect(isTargetContentScriptUrl(urlWithHost(HOSTNAME.EDDIBB, "/sample-board/"))).toBe(false);
    expect(isTargetContentScriptUrl(urlWithHost(HOSTNAME.NEW_JBBS, "/sample-dir/12/"))).toBe(true);
    expect(isTargetContentScriptUrl(urlWithHost(HOSTNAME.NEW_JBBS, "/single/board/"))).toBe(false);
    expect(isTargetContentScriptUrl("https://external.example.test/test/read.cgi/board/123/")).toBe(
      false,
    );
  });

  it("eddibbの短縮スレッドURLを取得器向け形式へ正規化する", () => {
    expect(
      normalizeContentScriptTargetUrl(urlWithHost(HOSTNAME.EDDIBB, "/sample-board/123/")),
    ).toBe(`http://${HOSTNAME.EDDIBB}/test/read.cgi/sample-board/123/`);
    expect(normalizeContentScriptTargetUrl(urlWithHost(HOSTNAME.EDDIBB, "/sample-board/"))).toBe(
      `https://${HOSTNAME.EDDIBB}/sample-board/`,
    );
  });
});
