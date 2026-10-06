// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";

import { HOSTNAME } from "./hosts";
import {
  getWriteFormData,
  isWriteAuthToken,
  isWriteResultPageUrl,
  resolveWriteAuthCodeUrl,
} from "./write";

function urlWithHost(hostname: string, path: string, protocol = "https:"): string {
  const url = new URL(`${protocol}//example.com${path}`);
  url.hostname = hostname;
  return url.href;
}

describe("投稿URLから投稿フォームの意味データを作る", () => {
  it("5chの投稿先・文字コード・時刻を組み立て、レス番号をスレッドIDに混ぜない", () => {
    expect(
      getWriteFormData(
        urlWithHost(`server.${HOSTNAME.NEW_5CH}`, "/test/read.cgi/sample-board/123/45"),
        {
          name: "名前",
          mail: "sage",
          message: "本文",
          nowSeconds: 1_700_000_000,
        },
      ),
    ).toEqual({
      action: `https://server.${HOSTNAME.NEW_5CH}/test/bbs.cgi`,
      charset: "Shift_JIS",
      referer: `https://server.${HOSTNAME.NEW_5CH}/sample-board/`,
      input: {
        submit: "書きこむ",
        time: "1699999940",
        bbs: "sample-board",
        key: "123",
        FROM: "名前",
        mail: "sage",
        oekaki_thread1: "",
      },
      textarea: { MESSAGE: "本文" },
    });
  });

  it("したらばとまちBBSのフォーム項目名・action・charsetを分ける", () => {
    const jbbs = getWriteFormData(
      urlWithHost(HOSTNAME.NEW_JBBS, "/bbs/read.cgi/sample-dir/12/123/45"),
      { name: "名前", mail: "", message: "本文", nowSeconds: 1_700_000_000 },
    );
    expect(jbbs).toMatchObject({
      action: `https://${HOSTNAME.NEW_JBBS}/bbs/write.cgi/sample-dir/12/123/`,
      charset: "EUC-JP",
      referer: `https://${HOSTNAME.NEW_JBBS}/sample-dir/12/`,
      input: { TIME: "1699999940", DIR: "sample-dir", BBS: "12", KEY: "123" },
    });

    const machi = getWriteFormData(
      urlWithHost(`boards.example.${HOSTNAME.MACHI}`, "/bbs/read.cgi/sample-board/123/45"),
      {
        name: "名前",
        mail: "",
        message: "本文",
        nowSeconds: 1_700_000_000,
      },
    );
    expect(machi).toMatchObject({
      action: `https://boards.example.${HOSTNAME.MACHI}/bbs/write.cgi`,
      charset: "Shift_JIS",
      referer: `https://boards.example.${HOSTNAME.MACHI}/sample-board/`,
      input: { TIME: "1699999940", BBS: "sample-board", KEY: "123" },
    });
  });

  it("投稿結果URL・認証トークン・同じ掲示板のHTTPS認証先を判定する", () => {
    expect(
      isWriteResultPageUrl(
        urlWithHost(`server.${HOSTNAME.NEW_5CH}`, "/test/bbs.cgi?bbs=sample-board"),
      ),
    ).toBe(true);
    expect(isWriteResultPageUrl("https://other.example.test/test/bbs.cgi")).toBe(true);
    expect(isWriteResultPageUrl("https://other.example.test/unrelated/page")).toBe(false);
    expect(
      isWriteAuthToken(urlWithHost(HOSTNAME.EDDIBB, "/sample-board/123/"), "#0123456789abcdef"),
    ).toBe(true);
    expect(
      isWriteAuthToken(
        urlWithHost(`server.${HOSTNAME.NEW_5CH}`, "/sample-board/123/"),
        "#0123456789abcdef",
      ),
    ).toBe(false);
    expect(
      resolveWriteAuthCodeUrl(
        `本文 https://${HOSTNAME.EDDIBB}/auth-code?token=sample`,
        urlWithHost(HOSTNAME.EDDIBB, "/sample-board/123/", "http:"),
      ),
    ).toBe(`https://${HOSTNAME.EDDIBB}/auth-code?token=sample`);
    expect(
      resolveWriteAuthCodeUrl(
        "認証に失敗しました",
        urlWithHost(HOSTNAME.EDDIBB, "/sample-board/123/", "http:"),
      ),
    ).toBe(`https://${HOSTNAME.EDDIBB}/auth-code`);
    expect(
      resolveWriteAuthCodeUrl(
        "https://external.example.test/auth-code",
        urlWithHost(HOSTNAME.EDDIBB, "/sample-board/123/", "http:"),
      ),
    ).toBeNull();
  });
});
