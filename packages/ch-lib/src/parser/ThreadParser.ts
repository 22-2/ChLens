import { MetadataParser } from "../parser/MetadataParser";
import { ChURL } from "../url/ChURL";
import { decodeCharReference } from "../utils/entities";

/** Canonical response shape shared by Live and future Chlens service adapters. */
export interface IRes {
  number: number;
  name: string;
  mail: string;
  date: string;
  message: string;
  /** Raw legacy metadata is retained at the adapter boundary for NG/copy compatibility. */
  other?: string;
  id?: string;
  slip?: string;
  trip?: string;
  be?: string;
}

/** Canonical thread detail shape; `posts` is kept for compatibility with existing callers. */
export interface IThread {
  title?: string;
  posts: IRes[];
}

export type Post = IRes;
export type ThreadData = IThread;

export class ThreadParser {
  static parse(chUrl: ChURL, text: string): ThreadData {
    const tsld = chUrl.getTsld();
    if (tsld === "machi.to") {
      return this.parseMachi(text);
    } else if (tsld === "shitaraba.net") {
      // したらばの read_archive.cgi は dat ではなく HTML を返すため、通常の
      // read.cgi と同じ <> 区切り parser に渡すと本文が空になる。取得URLの
      // archive 判定を parser まで引き継ぎ、形式ごとの入力境界をここで分ける。
      return chUrl.isArchive ? this.parseJbbsArchive(text) : this.parseJbbs(text);
    } else {
      return this.parseCh(text);
    }
  }

  static parseCh(text: string): ThreadData {
    const posts: Post[] = [];
    let title: string | undefined;
    const lines = text.split("\n");

    lines.forEach((line, index) => {
      if (!line) return;
      const sp = line.split("<>");
      if (sp.length >= 4) {
        if (index === 0 && sp[4]) {
          title = decodeCharReference(sp[4]);
        }
        const meta = MetadataParser.parse(sp[0], sp[2]);
        posts.push({
          number: posts.length + 1,
          name: sp[0],
          mail: sp[1],
          date: meta.date,
          message: sp[3],
          id: meta.id,
          slip: meta.slip,
          trip: meta.trip,
        });
      }
    });
    return { title, posts };
  }

  static parseJbbs(text: string): ThreadData {
    const posts: Post[] = [];
    let title: string | undefined;
    const lines = text.split("\n");

    lines.forEach((line) => {
      if (!line) return;
      const sp = line.split("<>");
      if (sp.length >= 6) {
        const num = parseInt(sp[0], 10);
        if (num === 1) {
          title = decodeCharReference(sp[5]);
        }
        const meta = MetadataParser.parse(sp[1], sp[3]);
        posts.push({
          number: num,
          name: sp[1],
          mail: sp[2],
          date: meta.date,
          message: sp[4],
          id: sp[6] || meta.id,
          slip: meta.slip,
          trip: meta.trip,
        });
      }
    });

    return { title, posts };
  }

  static parseJbbsArchive(text: string): ThreadData {
    // したらば過去ログは dat ではなく、レスごとの <dt>/<dd> を持つ HTML として
    // 配信される。区切りを先に正規化することで、改行の有無が異なる archive fixture
    // でも同じ canonical IRes を返せるようにする。
    const normalized = text.replace(/\r?\n/g, "").replace(/<\/h1>\s*<dl>/i, "</h1></dd><br><br>");
    const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(normalized);
    const title = titleMatch ? decodeCharReference(titleMatch[1]) : undefined;
    const posts: Post[] = [];
    const separator = /<\/dd>\s*<br\s*\/?>\s*<br\s*\/?>/i;

    for (const segment of normalized.split(separator)) {
      const postMatch =
        /<dt[^>]*>\s*(\d+)\s*[:：]\s*(?:<a\s+href=["']mailto:([^"']*)["'][^>]*>)?\s*(?:<font[^>]*>)?\s*<b>([\s\S]*?)<\/b>(?:<\/a>)?([\s\S]*?)<\/dt>\s*<dd[^>]*>\s*([\s\S]*?)(?:<br\s*\/?>|$)/i.exec(
          segment,
        );
      if (!postMatch) continue;

      const [, numberText, mail = "", name, dateText, message] = postMatch;
      const metadata = MetadataParser.parse(name, dateText.trim().replace(/^[:：]\s*/, ""));
      posts.push({
        number: Number(numberText),
        name,
        mail,
        date: metadata.date,
        message,
        id: metadata.id,
        slip: metadata.slip,
        trip: metadata.trip,
      });
    }

    return { title, posts };
  }

  static parseMachi(text: string): ThreadData {
    const posts: Post[] = [];
    let title: string | undefined;
    const lines = text.split("\n");

    lines.forEach((line) => {
      if (!line) return;
      const sp = line.split("<>");
      if (sp.length >= 5) {
        const num = parseInt(sp[0], 10);
        if (num === 1) {
          title = decodeCharReference(sp[5]);
        }
        posts.push({
          number: num,
          name: sp[1],
          mail: sp[2],
          date: sp[3],
          message: sp[4],
        });
      }
    });

    return { title, posts };
  }
}
