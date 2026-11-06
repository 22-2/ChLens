import { describe, expect, it, vi } from "vite-plus/test";

import { createConcurrencyLimiter } from "./image-request-limiter";

describe("画像通信の同時数制限", () => {
  it("上限までは即座に通し、超えた分は空きを待たせる", () => {
    const limiter = createConcurrencyLimiter(2);
    const grants = [vi.fn(), vi.fn(), vi.fn()];
    const tickets = grants.map((grant) => limiter.acquire(grant));

    expect(grants[0]).toHaveBeenCalledTimes(1);
    expect(grants[1]).toHaveBeenCalledTimes(1);
    expect(grants[2]).not.toHaveBeenCalled();

    tickets[0]!.release();
    expect(grants[2]).toHaveBeenCalledTimes(1);
  });

  it("待機中は新しい要求を先に通す", () => {
    const limiter = createConcurrencyLimiter(1);
    const first = limiter.acquire(vi.fn());
    const older = vi.fn();
    const newer = vi.fn();
    limiter.acquire(older);
    limiter.acquire(newer);

    first.release();
    expect(newer).toHaveBeenCalledTimes(1);
    expect(older).not.toHaveBeenCalled();
  });

  it("待機中に取り消した要求は呼ばれず、枠も消費しない", () => {
    const limiter = createConcurrencyLimiter(1);
    const first = limiter.acquire(vi.fn());
    const canceled = vi.fn();
    const next = vi.fn();
    const canceledTicket = limiter.acquire(canceled);
    limiter.acquire(next);

    canceledTicket.release();
    first.release();
    expect(canceled).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("同じ枠を二重に返しても、ほかの枠を壊さない", () => {
    const limiter = createConcurrencyLimiter(1);
    const first = limiter.acquire(vi.fn());
    const second = vi.fn();
    const third = vi.fn();
    limiter.acquire(second);
    limiter.acquire(third);

    first.release();
    first.release();
    expect(third).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
