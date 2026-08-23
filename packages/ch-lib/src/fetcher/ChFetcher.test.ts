import { describe, expect, it } from "vite-plus/test";
import { ChFetcher } from "./ChFetcher";
import type { HttpClient, HttpResponse } from "./HttpClient";

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
      new Map([[subjectUrl, { status: 200, headers: {}, body: subject }]]),
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
      new Map([[datUrl, { status: 404, headers: {}, body: new ArrayBuffer(0) }]]),
    );

    await expect(
      new ChFetcher(client).fetchThread("https://bbs.eddibb.cc/liveedge/1000000001/"),
    ).rejects.toMatchObject({ name: "HttpStatusError", status: 404, url: datUrl });
    expect(client.requests).toEqual([datUrl]);
  });
});
