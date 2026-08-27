import { encode } from "@toon-format/toon";
import type { IRes, IThreadDetail } from "src/service-container/interfaces";
import { stripHtml } from "src/view/browser/utils/response-format";

interface ToonThreadResponse {
  num: number;
  date: string;
  id: string;
  message: string;
}

export interface ToonThread {
  title: string;
  url: string;
  responses: ToonThreadResponse[];
}

function toToonResponse(response: IRes): ToonThreadResponse {
  return {
    num: response.num,
    date: response.date,
    id: response.id ?? "",
    message: stripHtml(response.message),
  };
}

export function encodeThreadAsToon(thread: Pick<IThreadDetail, "title" | "url" | "res">): string {
  const data: ToonThread = {
    title: thread.title,
    url: thread.url,
    // 変更理由: 全レスを同じキー順のプリミティブ値へ揃えると、TOONが
    // レスごとのキーを繰り返さない表形式として安全にエンコードできる。
    responses: thread.res.map(toToonResponse),
  };

  return encode(data);
}

export function estimateToonTokenCount(text: string): number {
  // 変更理由: tokenizerの巨大な語彙データを拡張機能へ同梱すると起動負荷が増えるため、
  // 日本語のマルチバイト文字も加味できる「UTF-8で約4バイト/トークン」を目安にする。
  return Math.ceil(new TextEncoder().encode(text).length / 4);
}
