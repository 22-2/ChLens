import { MetadataParser, type IRes, type IThread } from "packages/ch-lib/src/index";
import type { ParsedThread, ThreadRes } from "src/core/ThreadParser.js";

/**
 * Converts the cache/parser shape used by the existing Chlens fetch pipeline into ch-lib's
 * canonical model. The old parser intentionally keeps raw `other` metadata, so the adapter
 * preserves it while assigning the canonical response number here instead of making every
 * parser format invent its own numbering rule.
 */
export function toCanonicalRes(res: ThreadRes, number: number): IRes {
  const metadata = MetadataParser.parse(res.name, res.other);
  const be = /BE:\d+-[A-Z\d]+\(\d+\)/.exec(res.other)?.[0];

  return {
    number,
    name: res.name,
    mail: res.mail,
    date: metadata.date,
    message: res.message,
    other: res.other,
    // HTML形式では属性から直接抽出したIDを優先し、旧dat形式では従来どおり
    // other内のメタデータから復元する。形式ごとの解析差を表示側へ漏らさない。
    id: res.id ?? metadata.id,
    slip: metadata.slip,
    trip: metadata.trip,
    be,
  };
}

export function toCanonicalThread(thread: ParsedThread): IThread {
  return {
    ...(thread.title === undefined ? {} : { title: thread.title }),
    posts: thread.res.map((res, index) => toCanonicalRes(res, index + 1)),
  };
}

/**
 * Converts a canonical snapshot back to the legacy cache shape when an old cache entry must be
 * written. Keeping this reverse operation explicit prevents `number`/`res` field aliases from
 * leaking into persisted records and makes the eventual cache migration reversible.
 */
export function fromCanonicalThread(thread: IThread, expired = false): ParsedThread {
  return {
    ...(thread.title === undefined ? {} : { title: thread.title }),
    res: thread.posts.map((post) => ({
      name: post.name,
      mail: post.mail,
      message: post.message,
      other: post.other ?? post.date,
      ...(post.id ? { id: post.id } : {}),
    })),
    ...(expired ? { expired: true } : {}),
  };
}
