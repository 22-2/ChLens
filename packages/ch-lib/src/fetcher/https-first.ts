/**
 * GETはHTTP指定でもHTTPSを先に試し、TLS接続に失敗した場合だけ元のURLへ戻す。
 * 変更理由: 平文通信を避けつつ、HTTPS非対応の掲示板は従来どおり読めるようにする。
 */
export async function fetchHttpsFirst<T extends { status: number }>(
  url: string,
  method: string | undefined,
  fetchUrl: (url: string) => Promise<T>,
  headers?: Readonly<Record<string, string>>,
): Promise<T> {
  if ((method ?? "GET").toUpperCase() !== "GET") return fetchUrl(url);

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return fetchUrl(url);
  }
  if (parsedUrl.protocol !== "http:") return fetchUrl(url);

  parsedUrl.protocol = "https:";
  try {
    return await fetchUrl(parsedUrl.href);
  } catch (error) {
    const hasSensitiveHeader = Object.keys(headers ?? {}).some((name) =>
      ["authorization", "cookie"].includes(name.toLowerCase()),
    );
    if (hasSensitiveHeader) throw error;

    if (
      (typeof DOMException !== "undefined" &&
        error instanceof DOMException &&
        error.name === "AbortError") ||
      (typeof error === "string" && /abort/i.test(error))
    ) {
      throw error;
    }

    // 変更理由: HTTPへの再試行はHTTPS接続自体ができない場合だけに限定し、
    // HTTPSで拒否された要求や認証情報を平文で再送しない。
    console.warn("HTTPS接続に失敗したため、元のHTTP URLで再試行します", error);
    return fetchUrl(url);
  }
}
