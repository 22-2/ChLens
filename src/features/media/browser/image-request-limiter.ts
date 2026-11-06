/**
 * 画像の通信（サイズ確認のHEADと本体の取得）を同時に走らせる数を絞る。
 *
 * 変更理由: 1MB級の画像が数百枚あるスレを高速にスクロールすると、通り過ぎた画像まで
 * 次々に取得を始め、短時間に数十MBの通信が走っていた。同時数に上限を置き、
 * 待っている間に画面外へ出た画像は取得せずに取り消せるようにする。
 */

/** ブラウザが1つのホストへ同時に張る接続数に合わせる。 */
export const IMAGE_MAX_CONCURRENT_REQUESTS = 6;

/** 画面内にこれだけ留まった画像だけ取得を始める。スクロールで通り過ぎるだけの画像を除く。 */
export const IMAGE_VISIBLE_DWELL_MS = 150;

export interface RequestTicket {
  /** 枠を返す。待機中なら取り消す。何度呼んでもよい。 */
  release: () => void;
}

export interface ConcurrencyLimiter {
  /**
   * 枠を要求する。空いていればすぐ、埋まっていれば空き次第 `onGrant` を呼ぶ。
   * 待機中は新しい要求を先に通す（今見えている画像を優先し、見終えた画像は後回しにする）。
   */
  acquire: (onGrant: () => void) => RequestTicket;
}

type EntryState = "waiting" | "active" | "done";

export function createConcurrencyLimiter(maxConcurrent: number): ConcurrencyLimiter {
  let active = 0;
  const waiting: Array<{ onGrant: () => void; state: EntryState }> = [];

  const pump = () => {
    while (active < maxConcurrent && waiting.length > 0) {
      const entry = waiting.pop();
      if (!entry) return;
      entry.state = "active";
      active++;
      entry.onGrant();
    }
  };

  return {
    acquire(onGrant) {
      const entry = { onGrant, state: "waiting" as EntryState };
      waiting.push(entry);
      pump();
      return {
        release() {
          if (entry.state === "done") return;
          if (entry.state === "active") {
            active--;
          } else {
            const index = waiting.indexOf(entry);
            if (index >= 0) waiting.splice(index, 1);
          }
          entry.state = "done";
          pump();
        },
      };
    },
  };
}

export const imageRequestLimiter = createConcurrencyLimiter(IMAGE_MAX_CONCURRENT_REQUESTS);

/** 取り消せない通信（サイズ確認のHEAD）向け。枠が取れたら、返却用の関数を渡す。 */
export function acquireImageSlot(
  limiter: ConcurrencyLimiter = imageRequestLimiter,
): Promise<() => void> {
  return new Promise((resolve) => {
    // 枠が空いていると acquire の戻り値より先に onGrant が呼ばれる。
    // 返却用の関数は後から呼ばれるため、その時点では ticket が確定している。
    const ticket: RequestTicket = limiter.acquire(() => resolve(() => ticket.release()));
  });
}
