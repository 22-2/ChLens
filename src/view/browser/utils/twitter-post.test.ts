import { describe, expect, it, vi } from "vite-plus/test";
import { parseTwitterPostResponse, TwitterPostResolver } from "src/view/browser/utils/twitter-post";

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
      author: {
        name: "表示名",
        screen_name: "example",
        avatar_url: "https://pbs.twimg.com/profile.jpg",
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
  it("FxTwitter APIの投稿本文・作者・画像・動画を安全に取り出す", () => {
    expect(parseTwitterPostResponse(createPostResponse(), POST_URL, POST_ID)).toEqual({
      id: POST_ID,
      url: POST_URL,
      text: "投稿本文",
      author: {
        name: "表示名",
        screenName: "example",
        avatarUrl: "https://pbs.twimg.com/profile.jpg",
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
