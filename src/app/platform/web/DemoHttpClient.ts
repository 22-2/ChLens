import type {
  BinaryHttpResponse,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "src/app/platform/types";

// 実在する掲示板への通信を発生させず、既存の板・スレッド解析を架空データで試せるようにする。
const MENU = `<html><title>デモ板一覧</title>
<BR><BR><B>お試し</B><BR>
<A HREF="https://example.com/demo/">デモ掲示板</A><BR>
</html>`;
const SUBJECT = `1700000001.dat<>【デモ】はじめてのスレッド (3)
1700000002.dat<>【デモ】雑談しましょう (2)
`;
const THREADS: Record<string, string> = {
  "1700000001": `デモの案内人<>sage<>2025/01/01(水) 12:00:00 ID:demo1<>これは架空のスレッドです。 ChLensの表示をお試しください。<>【デモ】はじめてのスレッド
お試しさん<>sage<>2025/01/01(水) 12:01:00 ID:demo2<>こんにちは！<br>このレスもデモ用のデータです。<>
案内人<>sage<>2025/01/01(水) 12:02:00 ID:demo1<>&gt;&gt;2<br>返信やアンカーの表示も確認できます。<>
`,
  "1700000002": `お試しさん<>sage<>2025/01/02(木) 12:00:00 ID:demo3<>今日はどんな一日でしたか？<>【デモ】雑談しましょう
デモの住人<>sage<>2025/01/02(木) 12:01:00 ID:demo4<>のんびり過ごしています。<>
`,
};

function readDemo(url: string, options: HttpRequestOptions = {}): HttpResponse {
  if (options.method && options.method.toUpperCase() !== "GET")
    throw new Error("デモでは書き込みできません");
  const parsed = new URL(url);
  if (parsed.hostname !== "example.com") throw new Error("デモでは架空の掲示板だけを開けます");
  const match = /^\/demo\/dat\/(\d+)\.dat$/.exec(parsed.pathname);
  const body =
    parsed.pathname === "/bbsmenu.html"
      ? MENU
      : parsed.pathname === "/demo/subject.txt"
        ? SUBJECT
        : match
          ? THREADS[match[1]!]
          : undefined;
  return { status: body === undefined ? 404 : 200, headers: {}, body: body ?? "", url };
}

export const DemoHttpClient: HttpClient = {
  async fetch(url, options) {
    return readDemo(url, options);
  },
  async fetchBinary(url, options): Promise<BinaryHttpResponse> {
    const response = readDemo(url, options);
    return { ...response, body: new TextEncoder().encode(response.body).buffer };
  },
  async setupWriteHeaders() {
    throw new Error("デモでは書き込みできません");
  },
};
