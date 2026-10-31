import {
  decideImageError,
  decidePreflight,
  getExternalImagePlaceholderText,
  isHttpUrl,
  isStaleImageRequest,
  resolveRenderedSrc,
  shouldMarkImageLoaded,
} from "src/features/media/ui/external-image-state";
import { describe, expect, it } from "vite-plus/test";

const IMAGE_URL = "https://images.example.com/photo.png";

describe("isHttpUrl", () => {
  it.each([
    ["https://images.example.com/photo.png", true],
    ["http://images.example.com/photo.png", true],
    ["blob:https://example.com/0f1e2d", false],
    ["data:image/png;base64,AAAA", false],
    ["not a url", false],
  ])("URL %s の判定は %s", (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });
});

describe("decidePreflight", () => {
  const base = { manualLoad: false, status: undefined, lazy: false, canObserveVisibility: true };

  it("手動取得の指定がある画像は、自動では確認しない", () => {
    expect(decidePreflight({ ...base, manualLoad: true })).toBe("none");
  });

  it("削除済みの画像は、再確認しない", () => {
    expect(decidePreflight({ ...base, status: "discarded" })).toBe("none");
  });

  it("確認待ちの画像は、上限の範囲内で取得を許可する", () => {
    expect(decidePreflight({ ...base, status: "awaiting-confirmation" })).toBe(
      "allow-within-limit",
    );
  });

  it.each(["checking", "requested", "loaded"] as const)(
    "状態 %s の画像は、すでに処理中なので何もしない",
    (status) => {
      expect(decidePreflight({ ...base, status })).toBe("none");
    },
  );

  it("遅延読み込みの画像は、表示領域へ近づくまで待つ", () => {
    expect(decidePreflight({ ...base, lazy: true, canObserveVisibility: true })).toBe(
      "wait-for-visible",
    );
  });

  it("遅延読み込みでも、表示の監視ができなければすぐに確認する", () => {
    expect(decidePreflight({ ...base, lazy: true, canObserveVisibility: false })).toBe(
      "request-now",
    );
  });

  it("遅延読み込みではない画像は、すぐに確認する", () => {
    expect(decidePreflight({ ...base, lazy: false })).toBe("request-now");
  });
});

describe("decideImageError", () => {
  const base = {
    currentSrcAttr: IMAGE_URL,
    isCurrentSource: true,
    fallbackStatus: "idle" as const,
    isTauri: false,
    isHttp: true,
    failedCachedFallback: false,
  };

  it("src 属性を外したことによるエラーは無視する", () => {
    expect(decideImageError({ ...base, currentSrcAttr: null })).toEqual({ action: "ignore" });
    expect(decideImageError({ ...base, currentSrcAttr: "" })).toEqual({ action: "ignore" });
  });

  it("表示中の元のURLと違うエラーは無視する", () => {
    expect(decideImageError({ ...base, isCurrentSource: false })).toEqual({ action: "ignore" });
  });

  it("Tauriの取得を待っている間や、すでに失敗したあとのエラーは無視する", () => {
    expect(decideImageError({ ...base, fallbackStatus: "pending" })).toEqual({
      action: "ignore",
    });
    expect(decideImageError({ ...base, fallbackStatus: "failed" })).toEqual({
      action: "ignore",
    });
  });

  it("Tauriではない環境では、取得の切り替えをせず失敗を確定する", () => {
    expect(decideImageError(base)).toEqual({ action: "fail", reportCachedFailure: false });
  });

  it("http・https 以外のURLは、Tauriでも切り替えず失敗を確定する", () => {
    expect(decideImageError({ ...base, isTauri: true, isHttp: false })).toEqual({
      action: "fail",
      reportCachedFailure: false,
    });
  });

  it("Tauriで外部のURLが読めなければ、Rust側の取得へ切り替える", () => {
    expect(decideImageError({ ...base, isTauri: true })).toEqual({ action: "fallback" });
  });

  it("取得済みの画像が表示できなかった場合は、失敗を記録すべき場合として確定する", () => {
    expect(decideImageError({ ...base, isTauri: true, fallbackStatus: "loaded" })).toEqual({
      action: "fail",
      reportCachedFailure: true,
    });
  });

  it("ストアの保存済みフォールバックが失敗したら、切り替えず記録して確定する", () => {
    expect(decideImageError({ ...base, isTauri: true, failedCachedFallback: true })).toEqual({
      action: "fail",
      reportCachedFailure: true,
    });
  });
});

describe("isStaleImageRequest", () => {
  const request = { src: IMAGE_URL, componentRequestVersion: 2, imageRequestVersion: 5 };

  it("依頼時と同じ画像・世代・版なら、結果を使ってよい", () => {
    expect(
      isStaleImageRequest(request, {
        src: IMAGE_URL,
        componentRequestVersion: 2,
        imageVersion: 5,
      }),
    ).toBe(false);
  });

  it("表示するURLが変わっていたら、結果を破棄する", () => {
    expect(
      isStaleImageRequest(request, {
        src: "https://images.example.com/other.png",
        componentRequestVersion: 2,
        imageVersion: 5,
      }),
    ).toBe(true);
  });

  it("コンポーネントの取得世代が進んでいたら、結果を破棄する", () => {
    expect(
      isStaleImageRequest(request, {
        src: IMAGE_URL,
        componentRequestVersion: 3,
        imageVersion: 5,
      }),
    ).toBe(true);
  });

  it("ストア上の画像の版が変わっていたら、結果を破棄する", () => {
    expect(
      isStaleImageRequest(request, {
        src: IMAGE_URL,
        componentRequestVersion: 2,
        imageVersion: 6,
      }),
    ).toBe(true);
  });
});

describe("resolveRenderedSrc", () => {
  it("取得済みのフォールバックがあれば、元のURLより優先する", () => {
    expect(
      resolveRenderedSrc({
        fallbackSrc: "blob:fallback",
        isCurrentSource: true,
        renderedSrc: IMAGE_URL,
      }),
    ).toBe("blob:fallback");
  });

  it("フォールバックがなく表示中の元のURLなら、そのURLを使う", () => {
    expect(
      resolveRenderedSrc({ fallbackSrc: null, isCurrentSource: true, renderedSrc: IMAGE_URL }),
    ).toBe(IMAGE_URL);
  });

  it("表示中のURLが別になっていたら、古い表示先は使わない", () => {
    expect(
      resolveRenderedSrc({ fallbackSrc: null, isCurrentSource: false, renderedSrc: IMAGE_URL }),
    ).toBeNull();
  });
});

describe("shouldMarkImageLoaded", () => {
  it("表示中の画像が、表示しようとしたURLで読み込めたときだけ完了として扱う", () => {
    expect(
      shouldMarkImageLoaded({
        renderedSrc: IMAGE_URL,
        isCurrentSource: true,
        eventSrcAttr: IMAGE_URL,
      }),
    ).toBe(true);
  });

  it("表示先が無い（null）場合は完了として扱わない", () => {
    expect(
      shouldMarkImageLoaded({ renderedSrc: null, isCurrentSource: true, eventSrcAttr: null }),
    ).toBe(false);
  });

  it("読み込み完了時のsrcが表示先と違えば、完了として扱わない", () => {
    expect(
      shouldMarkImageLoaded({
        renderedSrc: IMAGE_URL,
        isCurrentSource: true,
        eventSrcAttr: "blob:old",
      }),
    ).toBe(false);
  });

  it("表示中のURLが別になっていれば、完了として扱わない", () => {
    expect(
      shouldMarkImageLoaded({
        renderedSrc: IMAGE_URL,
        isCurrentSource: false,
        eventSrcAttr: IMAGE_URL,
      }),
    ).toBe(false);
  });
});

describe("getExternalImagePlaceholderText", () => {
  const base = {
    status: undefined,
    contentLength: undefined,
    maxBytes: undefined,
    manualLoad: false,
  };

  it("削除済みの画像は、削除された旨を出す", () => {
    expect(getExternalImagePlaceholderText({ ...base, status: "discarded" })).toBe(
      "削除されました",
    );
  });

  it("サイズを確認中の画像は、確認中の旨を出す", () => {
    expect(getExternalImagePlaceholderText({ ...base, status: "checking" })).toBe(
      "画像サイズを確認中...",
    );
  });

  it("サイズが分からない確認待ちの画像は、確認できない旨を出す", () => {
    expect(
      getExternalImagePlaceholderText({
        ...base,
        status: "awaiting-confirmation",
        contentLength: null,
      }),
    ).toBe("画像サイズを確認できません。クリックして確認");
  });

  it("サイズと上限が分かる確認待ちの画像は、両方をMB単位で示す", () => {
    expect(
      getExternalImagePlaceholderText({
        ...base,
        status: "awaiting-confirmation",
        contentLength: 2_500_000,
        maxBytes: 5_000_000,
      }),
    ).toBe("2.50 MBの画像（上限 5.00 MB）。クリックして確認");
  });

  it("上限が無い確認待ちの画像は、上限を0MBとして示す", () => {
    expect(
      getExternalImagePlaceholderText({
        ...base,
        status: "awaiting-confirmation",
        contentLength: 1_000_000,
      }),
    ).toBe("1.00 MBの画像（上限 0.00 MB）。クリックして確認");
  });

  it("手動取得の設定では、クリックして取得する旨を出す", () => {
    expect(getExternalImagePlaceholderText({ ...base, manualLoad: true })).toBe(
      "クリックして画像を取得",
    );
  });

  it("自動取得の設定では、サイズを確認中の旨を出す", () => {
    expect(getExternalImagePlaceholderText({ ...base, status: undefined })).toBe(
      "画像サイズを確認中...",
    );
  });
});
