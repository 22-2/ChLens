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
      return this.parseJbbs(text);
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
