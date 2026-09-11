import { parseTwitterPostResponse, TwitterPostResolver } from "src/view/browser/utils/twitter-post";
import { describe, expect, it, vi } from "vite-plus/test";

const POST_URL = "https://x.com/example/status/1234567890123456789";
const POST_ID = "1234567890123456789";

function createPostResponse(): string {
  return JSON.stringify({
    code: 200,
    status: {
      type: "status",
      id: POST_ID,
      url: POST_URL,
      text: "投稿本文",
      created_at: "Fri Sep 04 10:00:00 +0000 2026",
      created_timestamp: 1788516000,
      source: "Twitter Web App",
      replies: 412,
      reposts: 3300,
      quotes: 17,
      likes: 38600,
      views: 11800000,
      bookmarks: 205,
      author: {
        name: "表示名",
        screen_name: "example",
        avatar_url: "https://pbs.twimg.com/profile.jpg",
        verification: {
          verified: true,
          type: "organization",
        },
      },
      media: {
        all: [
          {
            type: "photo",
            url: "https://pbs.twimg.com/media/photo.jpg",
            altText: "写真の説明",
          },
          {
            type: "video",
            url: "https://video.twimg.com/video.mp4",
            thumbnail_url: "https://pbs.twimg.com/media/video.jpg",
          },
        ],
      },
    },
  });
}

describe("TwitterPostResolver", () => {
  it("FxTwitter APIの投稿本文・作者・反応数・認証色・メディアを安全に取り出す", () => {
    expect(parseTwitterPostResponse(createPostResponse(), POST_URL, POST_ID)).toEqual({
      id: POST_ID,
      url: POST_URL,
      text: "投稿本文",
      createdTimestamp: 1788516000,
      source: "Twitter Web App",
      author: {
        name: "表示名",
        screenName: "example",
        avatarUrl: "https://pbs.twimg.com/profile.jpg",
        verificationBadge: {
          color: "gold",
          type: "organization",
        },
      },
      metrics: {
        replies: 412,
        reposts: 3300,
        quotes: 17,
        likes: 38600,
        views: 11800000,
        bookmarks: 205,
      },
      media: [
        {
          type: "image",
          url: "https://pbs.twimg.com/media/photo.jpg",
          altText: "写真の説明",
        },
        {
          type: "video",
          url: "https://video.twimg.com/video.mp4",
          posterUrl: "https://pbs.twimg.com/media/video.jpg",
          isGif: false,
        },
      ],
    });
  });

  it.each([
    ["individual", "blue"],
    ["organization", "gold"],
    ["government", "gray"],
  ] as const)("認証種別%sを%s色のバッジへ変換する", (type, color) => {
    const response = JSON.parse(createPostResponse()) as {
      status: { author: { verification: { type: string } } };
    };
    response.status.author.verification.type = type;

    expect(parseTwitterPostResponse(JSON.stringify(response), POST_URL, POST_ID)).toMatchObject({
      author: {
        verificationBadge: { type, color },
      },
    });
  });

  it("旧形式の日時とリポスト数も現行表示用データへ補完する", () => {
    const response = JSON.parse(createPostResponse()) as { status: Record<string, unknown> };
    delete response.status.created_timestamp;
    delete response.status.reposts;
    response.status.retweets = 98;

    expect(parseTwitterPostResponse(JSON.stringify(response), POST_URL, POST_ID)).toMatchObject({
      createdTimestamp: 1788516000,
      metrics: { reposts: 98 },
    });
  });

  it("同じ投稿への取得をキャッシュし、APIへ認証情報を送らない", async () => {
    const fetch = vi.fn().mockResolvedValue({ status: 200, body: createPostResponse() });
    const resolver = new TwitterPostResolver({ fetch });

    await expect(resolver.resolve(POST_URL)).resolves.toMatchObject({ id: POST_ID });
    await expect(resolver.resolve(POST_URL)).resolves.toMatchObject({ id: POST_ID });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`https://api.fxtwitter.com/2/status/${POST_ID}`, {
      Accept: "application/json",
    });
  });

  it("削除済み投稿やHTTP失敗はnullへフォールバックし、原因をログへ出す", async () => {
    const logError = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        code: 404,
        status: {
          type: "tombstone",
          reason: "deleted",
          message: "この投稿は削除されています",
        },
      }),
    });
    const resolver = new TwitterPostResolver({ fetch, logError });

    await expect(resolver.resolve(POST_URL)).resolves.toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[0]).toContain(POST_ID);
  });

  it("API応答の投稿IDが違う場合は表示せず失敗として扱う", async () => {
    const logError = vi.fn();
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      body: createPostResponse().replace(POST_ID, "9876543210987654321"),
    });
    const resolver = new TwitterPostResolver({ fetch, logError });

    await expect(resolver.resolve(POST_URL)).resolves.toBeNull();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
