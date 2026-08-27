import type { ChURL } from "packages/ch-lib/src/index";
import { replaceAll } from "src/app/Util";

export interface ThreadRes {
  name: string;
  mail: string;
  message: string;
  other: string;
  id?: string;
}

export interface ParsedThread {
  title?: string;
  res: ThreadRes[];
  expired?: boolean;
}

export interface XhrInfo {
  path: string;
  charset: string;
}

export interface ParseThreadOptions {
  format2chnet?: string | null;
  resLength?: number;
}

const decodeEntityElement = typeof document !== "undefined" ? document.createElement("span") : null;

const decodeCharReference = (str: string): string => {
  return str.replace(
    /&(?:#(\d+)|#x([\dA-Fa-f]+)|([\da-zA-Z]+));/g,
    (_all, decimal, hex, entity) => {
      if (decimal != null) {
        return String.fromCodePoint(Number(decimal));
      }
      if (hex != null) {
        return String.fromCodePoint(parseInt(hex, 16));
      }
      if (entity != null && decodeEntityElement != null) {
        decodeEntityElement.innerHTML = `&${entity};`;
        return decodeEntityElement.textContent ?? `&${entity};`;
      }
      return _all;
    },
  );
};

const titleReg =
  / ?(?:\[(?:無断)?転載禁止\]|(?:\(c\)|©|�|&copy;|&#169;)(?:2ch\.net|@?bbspink\.com)) ?/g;

const removeNeedlessFromTitle = (title: string): string => {
  const trimmed = title.replace(titleReg, "");
  const normalized = trimmed === "" ? title : trimmed;
  return normalized.replaceAll("<mark>", "").replaceAll("</mark>", "");
};

const normalizeHtmlPostId = (rawId: string | undefined): string | undefined => {
  const match = /^(?:ID:)(?!\?\?\?)([^ <>"']+)/i.exec(rawId?.trim() ?? "");
  if (!match) return undefined;

  const id = match[1].replace(/●$/, "");
  return id || undefined;
};

const extractHtmlPostId = (postHtml: string): string | undefined => {
  const dataUserId = /\bdata-userid\s*=\s*["']([^"']*)["']/i.exec(postHtml)?.[1];
  const uid = /<span\b[^>]*\bclass=["'][^"']*\buid\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    postHtml,
  )?.[1];

  // 現行HTMLは属性と表示用spanの両方にIDを持つことがあるため、属性を優先しつつ、
  // 片方だけのレスにも対応する。HTML全体からID文字列を拾うと本文中の言及を
  // 誤認するため、レスのメタデータ位置に限定する。
  return normalizeHtmlPostId(dataUserId) ?? normalizeHtmlPostId(uid);
};

const normalizeHtmlPostMetadata = (postHtml: string, fallback: string): string => {
  const date = /<span\b[^>]*\bclass=["'][^"']*\bdate\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    postHtml,
  )?.[1];
  if (date == null) return fallback;

  const uid = /<span\b[^>]*\bclass=["'][^"']*\buid\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(
    postHtml,
  )?.[1];
  return [date.trim(), uid?.trim()].filter(Boolean).join(" ");
};

const normalizeResName = (name: string | undefined): string => {
  // 名前欄が空のレスは空文字のままUIへ渡すと投稿者名が表示されないため、
  // 各データ形式の解析結果を共通のデフォルト名へ揃える。
  return name?.trim() ? name : "名無し";
};

const createAbonedRes = (): ThreadRes => ({
  name: "あぼーん",
  mail: "あぼーん",
  message: "あぼーん",
  other: "あぼーん",
});

const createBrokenRes = (): ThreadRes => ({
  name: "</b>データ破損<b>",
  mail: "",
  message: "データが破損しています",
  other: "",
});

const shouldUseDatFor5ch = (url: ChURL, format2chnet: string | null | undefined): boolean => {
  // headline.5ch.io は read.cgi を返さないため dat を強制して取得失敗を防ぐ。
  return url.url.hostname === "headline.5ch.io" || format2chnet === "dat";
};

export const isHtmlThread = (url: ChURL, format2chnet: string | null | undefined): boolean => {
  return (
    (format2chnet !== "dat" &&
      url.getTsld() === "5ch.io" &&
      url.url.hostname !== "headline.5ch.io") ||
    url.getTsld() === "bbspink.com"
  );
};

export const getThreadXhrInfo = (
  url: ChURL,
  format2chnet: string | null | undefined,
): XhrInfo | null => {
  const tmp = new RegExp("^/(?:test|bbs)/read(?:_archive)?\\.cgi/(\\w+)/(\\d+)/(?:(\\d+)/)?$").exec(
    url.url.pathname,
  );
  if (!tmp) {
    return null;
  }

  switch (url.getTsld()) {
    case "machi.to":
      return {
        path: `${url.url.origin}/bbs/offlaw.cgi/${tmp[1]}/${tmp[2]}/`,
        charset: "Shift_JIS",
      };
    case "shitaraba.net":
      if (url.isArchive) {
        return {
          path: url.url.href,
          charset: "EUC-JP",
        };
      }
      return {
        path: `${url.url.origin}/bbs/rawmode.cgi/${tmp[1]}/${tmp[2]}/${tmp[3]}/`,
        charset: "EUC-JP",
      };
    case "5ch.io":
      if (shouldUseDatFor5ch(url, format2chnet)) {
        return {
          path: `${url.url.origin}/${tmp[1]}/dat/${tmp[2]}.dat`,
          charset: "Shift_JIS",
        };
      }
      return {
        path: url.url.href,
        charset: "Shift_JIS",
      };
    case "bbspink.com":
      return {
        path: url.url.href,
        charset: "Shift_JIS",
      };
    default:
      return {
        path: `${url.url.origin}/${tmp[1]}/dat/${tmp[2]}.dat`,
        charset: "Shift_JIS",
      };
  }
};

export const parseThread = (
  url: ChURL,
  text: string,
  options: ParseThreadOptions = {},
): ParsedThread | null => {
  const { format2chnet, resLength } = options;

  switch (url.getTsld()) {
    case "":
      return null;
    case "machi.to":
      return parseMachiThread(text);
    case "shitaraba.net":
      return url.isArchive ? parseJbbsArchiveThread(text) : parseJbbsThread(text);
    case "5ch.io":
      return shouldUseDatFor5ch(url, format2chnet) ? parseChThread(text) : parseNetThread(text);
    case "bbspink.com":
      return parsePinkThread(text, resLength);
    default:
      return parseChThread(text);
  }
};

export const parseNetThread = (text: string): ParsedThread | null => {
  let titleReg = /<h1 [^<>]*>(.*)\n?<\/h1>/;
  let reg: RegExp;
  let separator: string;

  if (
    text.includes('<div class="footer push">read.cgi ver 06') &&
    !text.includes("</div></div><br>")
  ) {
    text = text.replace("</h1>", "</h1></div></div>");
    reg =
      /<div class="post"[^<>]*><div class="number">\d+[^<>]* : <\/div><div class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/div><div class="date">(.*)<\/div><div class="message"> ?(.*)/;
    separator = "</div></div>";
  } else if (
    text.includes('<div class="footer push">read.cgi ver 07') ||
    text.includes('<div class="footer push">read.cgi ver 06')
  ) {
    text = text.replace("</h1>", "</h1></div></div><br>");
    reg =
      /<div class="post"[^<>]*><div class="meta"><span class="number">\d+<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span><span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)(?:<\/span>)/;
    separator = "</div></div><br>";
  } else if (text.match(/<footer[^<>]*><br>read\.cgi ver 07\.([6-9]|\d+)/)) {
    titleReg = /<(?:div|h1) id="threadtitle">(.*)\n?<\/(?:div|h1)>/;
    reg =
      /<span class="postid">\d+<\/span><span class="postusername"><b>(?:<a rel="nofollow" href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">.*<\/span>)?<\/div>(?:<span style=".*">)?<span class="date">(.*)<\/span><\/div><div class="post-content"> ?(.*)/;
    separator = "</div></div>";
  } else if (text.match(/<footer[^<>]*><br>read\.cgi ver 0(7|8)/)) {
    titleReg = /<(?:div|h1) id="threadtitle">(.*)\n?<\/(?:div|h1)>/;
    reg =
      /<article[^<>]*><details[^<>]*><summary><span class="postid">\d+<\/span><span class="postusername"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">.*<\/span>)?<\/summary>(?:<span style=".*">)?<span class="date">(.*)<\/span><\/details><section class="post-content"> ?(.*)<\/section>/;
    separator = "</article>";
  } else {
    reg =
      /^(?:<\/?div.*?(?:<br><br>)?)?<dt>\d+.*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/;
    separator = "\n";
  }

  const thread: ParsedThread = { res: [] };
  let gotTitle = false;

  for (const line of text.split(separator)) {
    const title = gotTitle ? null : titleReg.exec(line);
    const regRes = reg.exec(line);

    if (title) {
      thread.title = removeNeedlessFromTitle(decodeCharReference(title[1]));
      gotTitle = true;
    }

    if (regRes) {
      const id = extractHtmlPostId(line);
      thread.res.push({
        name: normalizeResName(regRes[2]),
        mail: regRes[1] || "",
        message: regRes[4],
        other: normalizeHtmlPostMetadata(line, regRes[3]),
        ...(id ? { id } : {}),
      });
    }
  }

  if (text.includes('<div class="stoplight stopred stopdone">')) {
    thread.expired = true;
  }

  return thread.res.length > 0 ? thread : null;
};

export const parseChThread = (text: string): ParsedThread | null => {
  let numberOfBroken = 0;
  const thread: ParsedThread = { res: [] };

  const lines = text.split("\n");
  for (let key = 0; key < lines.length; key++) {
    const line = lines[key];
    if (line === "") {
      continue;
    }

    const sp = line.split("<>");
    if (sp.length >= 4) {
      if (key === 0) {
        thread.title = decodeCharReference(sp[4]);
      }

      thread.res.push({
        name: normalizeResName(sp[0]),
        mail: sp[1],
        message: sp[3],
        other: sp[2],
      });
    } else {
      numberOfBroken++;
      thread.res.push(createBrokenRes());
    }
  }

  return thread.res.length > 0 && thread.res.length > numberOfBroken ? thread : null;
};

const fillAbonedUntil = (
  thread: ParsedThread,
  currentResCount: number,
  targetResCount: number,
): number => {
  let nextCount = currentResCount;
  while (++nextCount !== targetResCount) {
    thread.res.push(createAbonedRes());
  }
  return nextCount;
};

export const parseMachiThread = (text: string): ParsedThread | null => {
  const thread: ParsedThread = { res: [] };
  let resCount = 0;
  let numberOfBroken = 0;

  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }

    const sp = line.split("<>");
    if (sp.length >= 5) {
      resCount = fillAbonedUntil(thread, resCount, Number(sp[0]));
      if (resCount === 1) {
        thread.title = decodeCharReference(sp[5]);
      }

      thread.res.push({
        name: normalizeResName(sp[1]),
        mail: sp[2],
        message: sp[4],
        other: sp[3],
      });
    } else {
      numberOfBroken++;
      thread.res.push(createBrokenRes());
    }
  }

  return thread.res.length > 0 && thread.res.length > numberOfBroken ? thread : null;
};

export const parseJbbsThread = (text: string): ParsedThread | null => {
  const thread: ParsedThread = { res: [] };
  let resCount = 0;
  let numberOfBroken = 0;

  for (const line of text.split("\n")) {
    if (line === "") {
      continue;
    }

    const sp = line.split("<>");
    if (sp.length >= 6) {
      resCount = fillAbonedUntil(thread, resCount, Number(sp[0]));
      if (resCount === 1) {
        thread.title = decodeCharReference(sp[5]);
      }

      thread.res.push({
        name: normalizeResName(sp[1]),
        mail: sp[2],
        message: sp[4],
        other: sp[3] + (sp[6] ? ` ID:${sp[6]}` : ""),
      });
    } else {
      numberOfBroken++;
      thread.res.push(createBrokenRes());
    }
  }

  return thread.res.length > 0 && thread.res.length > numberOfBroken ? thread : null;
};

export const parseJbbsArchiveThread = (text: string): ParsedThread | null => {
  text = replaceAll(text, "\n", "");
  text = text.replace(/<\/h1>\s*<dl>/, "</h1></dd><br><br>");

  const reg =
    /<dt[^>]*>\s*\d+ ：\s*(?:<a href="mailto:([^<>]*)">)?\s*(?:<font [^>]*>)?\s*<b>(.*)<\/b>.*：(.*)\s*<\/dt>\s*<dd>\s*(.*)\s*<br>/;
  const separator = /<\/dd>[\s\n]*<br><br>/;
  const titleReg = /<h1>(.*)<\/h1>/;

  const thread: ParsedThread = { res: [] };
  let gotTitle = false;

  for (const line of text.split(separator)) {
    const title = gotTitle ? null : titleReg.exec(line);
    const regRes = reg.exec(line);

    if (title) {
      thread.title = decodeCharReference(title[1]);
      gotTitle = true;
    } else if (regRes) {
      thread.res.push({
        name: normalizeResName(regRes[2]),
        mail: regRes[1] || "",
        message: regRes[4],
        other: regRes[3],
      });
    }
  }

  return thread.res.length > 0 ? thread : null;
};

export const parsePinkThread = (text: string, resLength?: number): ParsedThread | null => {
  let titleReg = /<h1 .*?>(.*)\n?<\/h1>/;
  let reg: RegExp;
  let separator: string;

  if (text.includes('<div class="footer push">read.cgi ver 06')) {
    text = text.replace(/<\/h1>/, "</h1></dd></dl>");
    reg =
      /^.*?<dl class="post".*><dt class=""><span class="number">(\d+).* : <\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?(.*?)(?:<\/a>|<\/font>)?<\/b><\/span><span class="date">(.*)<\/span><\/dt><dd class="thread_in"> ?(.*)$/;
    separator = "</dd></dl>";
  } else if (text.includes('<div class="footer push">read.cgi ver 07')) {
    text = text.replace("</h1>", "</h1></div></div><br>");
    reg =
      /<div class="post"[^<>]*><div class="meta"><span class="number">(\d+).*<\/span><span class="name"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">;.*<\/span>)?(?:<span style=".*">)?<span class="date">(.*)<\/span><\/div><div class="message">(?:<span class="escaped">)? ?(.*)(?:<\/span>)/;
    separator = "</div></div><br>";
  } else if (text.match(/<footer[^<>]*><br>read\.cgi ver 0(8|9)/)) {
    titleReg = /<div id="threadtitle">(.*)\n?<\/div>/;
    reg =
      /<article id="(\d+)"[^<>]*><details[^<>]*><summary><span class="postid">\d+<\/span><span class="postusername"><b>(?:<a href="mailto:([^<>]*)">|<font [^<>]*>)?(.*?)(?:<\/(?:a|font)>)?<\/b><\/span>(?:<span style=".*">;.*<\/span>)?<\/summary>(?:<span style=".*">)?<span class="date">(.*)<\/span><\/details><section class="post-content"> ?(.*)<\/section>/;
    separator = "</article>";
  } else {
    reg =
      /^(?:<\/?div.*?(?:<br><br>)?)?<dt>(\d+).*：(?:<a href="mailto:([^<>]*)">|<font [^>]*>)?<b>(.*)<\/b>.*：(.*)<dd> ?(.*)<br><br>$/;
    separator = "\n";
  }

  const thread: ParsedThread = { res: [] };
  let gotTitle = false;
  let resCount = resLength ?? 0;

  for (const line of text.split(separator)) {
    const title = gotTitle ? null : titleReg.exec(line);
    const regRes = reg.exec(line);

    if (title) {
      thread.title = removeNeedlessFromTitle(decodeCharReference(title[1]));
      gotTitle = true;
    }

    if (regRes) {
      while (++resCount < Number(regRes[1])) {
        thread.res.push(createAbonedRes());
      }
      thread.res.push({
        name: normalizeResName(regRes[3]),
        mail: regRes[2] || "",
        message: regRes[5],
        other: regRes[4],
      });
    }
  }

  return thread.res.length > 0 ? thread : null;
};
