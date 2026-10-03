import { describe, expect, it } from "vite-plus/test";

import { HOSTNAME } from "./hosts";
import {
  getReadStateBoardUrl,
  getReadStateThreadUrl,
  normalizeReadStateUrl,
  toArchiveThreadUrl,
} from "./storageIdentity";

function urlWithHost(hostname: string, path: string, protocol = "https:"): string {
  const url = new URL(`${protocol}//example.com${path}`);
  url.hostname = hostname;
  return url.href;
}

describe("URLを使う保存キー", () => {
  it("既読キーでは5chサーバーをまとめ、レス位置用hashを除く", () => {
    expect(
      normalizeReadStateUrl(
        urlWithHost(
          `old-server.${HOSTNAME.OLD_5CH_NET}`,
          "/test/read.cgi/sample-board/123/45?q=1#res=45",
        ),
      ),
    ).toBe(`https://*.${HOSTNAME.NEW_5CH}/test/read.cgi/sample-board/123/?q=1`);
  });

  it("壊れた既読URLは移行中も元の値を保つ", () => {
    expect(normalizeReadStateUrl("not a URL")).toBe("not a URL");
  });

  it("eddibb既読板URLだけをHTTPの既存照合キーへ揃える", () => {
    expect(getReadStateBoardUrl(urlWithHost(HOSTNAME.EDDIBB, "/sample-board/?q=1#top"))).toBe(
      `http://${HOSTNAME.EDDIBB}/sample-board/?q=1#top`,
    );
    expect(getReadStateBoardUrl(urlWithHost(`server.${HOSTNAME.NEW_5CH}`, "/sample-board/"))).toBe(
      `https://server.${HOSTNAME.NEW_5CH}/sample-board/`,
    );
  });

  it("eddibbの一覧スレURLをHTTPへ揃え、それ以外の元URLは維持する", () => {
    expect(
      getReadStateThreadUrl(urlWithHost(HOSTNAME.EDDIBB, "/sample-board/123/45?q=1#res=45")),
    ).toBe(`http://${HOSTNAME.EDDIBB}/test/read.cgi/sample-board/123/?q=1#res=45`);
    expect(
      getReadStateThreadUrl(
        urlWithHost(`server.${HOSTNAME.NEW_5CH}`, "/test/read.cgi/sample-board/123/45"),
      ),
    ).toBe(`https://server.${HOSTNAME.NEW_5CH}/test/read.cgi/sample-board/123/45`);
  });

  it("したらばの通常スレURLだけを過去ログ閲覧先へ変換する", () => {
    expect(
      toArchiveThreadUrl(urlWithHost(HOSTNAME.NEW_JBBS, "/bbs/read.cgi/sample-dir/12/123/")),
    ).toBe(`https://${HOSTNAME.NEW_JBBS}/bbs/read_archive.cgi/sample-dir/12/123/`);
    expect(
      toArchiveThreadUrl(
        urlWithHost(HOSTNAME.NEW_JBBS, "/bbs/read_archive.cgi/sample-dir/12/123/"),
      ),
    ).toBeNull();
  });
});
