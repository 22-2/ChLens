import { describe, expect, it } from "vite-plus/test";
import { ChFetcher } from "./ChFetcher";
import { createHttpResponseMetadata, type HttpClient, type HttpResponse } from "./HttpClient";

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(...parts: Uint8Array[]): ArrayBuffer {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result.buffer;
}

function fixtureResponse(
  status: number,
  headers: Readonly<Record<string, string>>,
  body: ArrayBuffer,
): HttpResponse {
  return { status, headers, body, metadata: createHttpResponseMetadata(headers, body) };
}

class FixtureHttpClient implements HttpClient {
  readonly requests: string[] = [];

  constructor(private readonly responses: ReadonlyMap<string, HttpResponse>) {}

  async get(url: string): Promise<HttpResponse> {
    this.requests.push(url);
    const response = this.responses.get(url);
    if (!response) throw new Error(`Missing fixture response: ${url}`);
    return response;
  }
}

describe("ChFetcher transport boundary", () => {
  it("normalizes an Eddibb board URL and decodes a Shift_JIS subject fixture", async () => {
    const subjectUrl = "https://bbs.eddibb.cc/liveedge/subject.txt";
    const subject = concatBytes(
      ascii("1000000001.dat<>"),
      // テスト in Shift_JIS; keeping the bytes explicit proves decoding is transport-independent.
      Uint8Array.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]),
      ascii(" (2)\n"),
    );
    const client = new FixtureHttpClient(
      new Map([[subjectUrl, fixtureResponse(200, {}, subject)]]),
    );

    const result = await new ChFetcher(client).fetchBoard("https://bbs.eddibb.cc/liveedge/");

    expect(client.requests).toEqual([subjectUrl]);
    expect(result).toEqual([
      {
        url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1000000001/",
        title: "テスト",
        resCount: 2,
        createdAt: 1000000001000,
      },
    ]);
  });

  it("normalizes a thread URL and reports non-success HTTP status", async () => {
    const datUrl = "http://bbs.eddibb.cc/liveedge/dat/1000000001.dat";
    const client = new FixtureHttpClient(
      new Map([[datUrl, fixtureResponse(404, {}, new ArrayBuffer(0))]]),
    );

    await expect(
      new ChFetcher(client).fetchThread("https://bbs.eddibb.cc/liveedge/1000000001/"),
    ).rejects.toMatchObject({ name: "HttpStatusError", status: 404, url: datUrl });
    expect(client.requests).toEqual([datUrl]);
  });

  it("SETTING.TXTからBBS_TITLE_ORIGを優先して板名を取得する", async () => {
    const settingUrl = "https://bbs.eddibb.cc/liveedge/SETTING.TXT";
    const setting = concatBytes(ascii("BBS_TITLE=Fallback\nBBS_TITLE_ORIG=Live Board\n"));
    const client = new FixtureHttpClient(
      new Map([[settingUrl, fixtureResponse(200, {}, setting)]]),
    );

    await expect(
      new ChFetcher(client).fetchBoardTitle("https://bbs.eddibb.cc/liveedge/"),
    ).resolves.toBe("Live Board");
    expect(client.requests).toEqual([settingUrl]);
  });

  it("returns HTTP metadata and parsed response count for incremental thread fetches", async () => {
    const datUrl = "http://bbs.eddibb.cc/liveedge/dat/1000000001.dat";
    const dat = concatBytes(ascii("name<>mail<>2026/08/23<>message<>Thread title\n"));
    const headers = {
      ETag: '"thread-v1"',
      "Last-Modified": "Sun, 23 Aug 2026 00:00:00 GMT",
      "Content-Length": String(dat.byteLength),
      "Content-Range": `bytes 0-${dat.byteLength - 1}/128`,
    };
    const client = new FixtureHttpClient(new Map([[datUrl, fixtureResponse(206, headers, dat)]]));

    const result = await new ChFetcher(client).fetchThreadWithMetadata(
      "https://bbs.eddibb.cc/liveedge/1000000001/",
      { headers: { Range: "bytes=0-" } },
    );

    expect(result.data.posts).toHaveLength(1);
    expect(result.metadata).toEqual({
      etag: '"thread-v1"',
      lastModified: "Sun, 23 Aug 2026 00:00:00 GMT",
      contentLength: dat.byteLength,
      contentRange: { start: 0, end: dat.byteLength - 1, total: 128 },
      bodyBytes: dat.byteLength,
      parsedResCount: 1,
    });
  });

  it("fetches Shitaraba archive HTML through the same thread source contract", async () => {
    const archiveUrl = "https://jbbs.shitaraba.net/bbs/read_archive.cgi/computer/12345/100/";
    const archive = ascii(
      "<h1>Archive title</h1><dl>" +
        "<dt>1 :<b>Anonymous</b> :2026/08/23 12:00:00 ID:first</dt>" +
        "<dd>Archive message<br></dd><br><br>",
    );
    const archiveBody = concatBytes(archive);
    const client = new FixtureHttpClient(
      new Map([[archiveUrl, fixtureResponse(200, { ETag: '"archive-v1"' }, archiveBody)]]),
    );

    const result = await new ChFetcher(client).fetchThreadWithMetadata(archiveUrl);

    expect(client.requests).toEqual([archiveUrl]);
    expect(result.data).toMatchObject({
      title: "Archive title",
      posts: [{ number: 1, message: "Archive message" }],
    });
    expect(result.metadata).toMatchObject({ etag: '"archive-v1"', parsedResCount: 1 });
  });
});
