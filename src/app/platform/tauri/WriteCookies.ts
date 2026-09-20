export interface WriteCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  expiresAt: number | null;
}

function getDefaultCookiePath(pathname: string): string {
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash <= 0 ? "/" : pathname.slice(0, lastSlash);
}

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function matchesPath(requestPath: string, cookiePath: string): boolean {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/";
}

function getCookieKey(cookie: Pick<WriteCookie, "name" | "domain" | "path">): string {
  return `${cookie.name}\u0000${cookie.domain}\u0000${cookie.path}`;
}

function parseCookie(rawCookie: string, responseUrl: URL): WriteCookie | null {
  const parts = rawCookie.split(";");
  const pair = parts.shift()?.trim() ?? "";
  const separator = pair.indexOf("=");
  if (separator <= 0) return null;

  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  if (!/^[\u0021-\u0039\u003B-\u007E]+$/.test(name)) return null;

  let domain = responseUrl.hostname.toLowerCase();
  let path = getDefaultCookiePath(responseUrl.pathname);
  let secure = false;
  let expiresAt: number | null = null;
  let maxAge: number | null = null;

  for (const rawAttribute of parts) {
    const attribute = rawAttribute.trim();
    const equalsIndex = attribute.indexOf("=");
    const attributeName = (equalsIndex < 0 ? attribute : attribute.slice(0, equalsIndex))
      .trim()
      .toLowerCase();
    const attributeValue = equalsIndex < 0 ? "" : attribute.slice(equalsIndex + 1).trim();

    switch (attributeName) {
      case "domain": {
        const normalizedDomain = attributeValue.replace(/^\./, "").toLowerCase();
        if (
          !normalizedDomain ||
          !matchesDomain(responseUrl.hostname.toLowerCase(), normalizedDomain)
        ) {
          return null;
        }
        domain = normalizedDomain;
        break;
      }
      case "path":
        if (attributeValue.startsWith("/")) path = attributeValue;
        break;
      case "secure":
        secure = true;
        break;
      case "max-age": {
        const parsed = Number.parseInt(attributeValue, 10);
        if (Number.isFinite(parsed)) maxAge = parsed;
        break;
      }
      case "expires": {
        const parsed = Date.parse(attributeValue);
        if (Number.isFinite(parsed)) expiresAt = parsed;
        break;
      }
    }
  }

  if (secure && responseUrl.protocol !== "https:") return null;
  if (maxAge != null) {
    expiresAt = maxAge <= 0 ? 0 : Date.now() + maxAge * 1000;
  }

  return { name, value, domain, path, secure, expiresAt };
}

export class WriteCookieJar {
  // 変更理由: 確認ページの二段階POSTに必要なCookieだけを送信処理の間だけ保持し、
  // 掲示板ごとのCookieをアプリ設定や次回の投稿へ持ち越さない。
  private readonly cookies = new Map<string, WriteCookie>();

  updateFromResponse(responseUrl: string, setCookies: readonly string[] | undefined): void {
    if (!setCookies || setCookies.length === 0) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(responseUrl);
    } catch (error) {
      console.error("書き込み確認Cookieの応答URLを解釈できませんでした:", error);
      return;
    }

    for (const rawCookie of setCookies) {
      const cookie = parseCookie(rawCookie, parsedUrl);
      if (!cookie) continue;

      const key = getCookieKey(cookie);
      if (cookie.expiresAt === 0 || (cookie.expiresAt != null && cookie.expiresAt <= Date.now())) {
        this.cookies.delete(key);
      } else {
        this.cookies.set(key, cookie);
      }
    }
  }

  getHeader(requestUrl: string): string | undefined {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(requestUrl);
    } catch (error) {
      console.error("書き込み確認Cookieの送信先URLを解釈できませんでした:", error);
      return undefined;
    }

    const now = Date.now();
    const matched = Array.from(this.cookies.values())
      .filter((cookie) => {
        if (cookie.expiresAt != null && cookie.expiresAt <= now) return false;
        if (cookie.secure && parsedUrl.protocol !== "https:") return false;
        return (
          matchesDomain(parsedUrl.hostname.toLowerCase(), cookie.domain) &&
          matchesPath(parsedUrl.pathname, cookie.path)
        );
      })
      .sort((left, right) => right.path.length - left.path.length)
      .map((cookie) => `${cookie.name}=${cookie.value}`);

    return matched.length > 0 ? matched.join("; ") : undefined;
  }

  clear(): void {
    this.cookies.clear();
  }
}
