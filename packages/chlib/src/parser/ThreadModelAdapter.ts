import { MetadataParser } from "./MetadataParser";
import type { IRes, IThread, ParsedThread, ThreadRes } from "./ThreadParser";

/** 旧キャッシュ形式のレスを共有モデルへ変換する。 */
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
    // HTML側で直接抽出したIDは、otherから推測した値より正確なので優先する。
    id: res.id ?? metadata.id,
    slip: metadata.slip,
    trip: metadata.trip,
    be,
  };
}

/** 旧キャッシュ形式のスレッドを共有モデルへ変換する。 */
export function toCanonicalThread(thread: ParsedThread): IThread {
  return {
    ...(thread.title === undefined ? {} : { title: thread.title }),
    posts: thread.res.map((res, index) => toCanonicalRes(res, index + 1)),
  };
}

/** 共有モデルを既存キャッシュ互換形式へ戻す。 */
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
