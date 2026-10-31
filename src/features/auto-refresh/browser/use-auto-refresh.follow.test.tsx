import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  AutoRefreshHarness,
  createRect,
  mockScrollBy,
  renderScrollableHarness,
  resizeObservers,
  setupAutoRefreshTest,
} from "src/test-support/auto-refresh-harness";
import { SCROLL_JUMP_EVENT } from "src/view/browser/utils/scroll-jump-event";
import { describe, expect, it, vi } from "vite-plus/test";

describe("useAutoRefresh", () => {
  setupAutoRefreshTest();

  it.each([false, true])(
    "通常・ライブチャットの新着描画で追従を外さず二重補正しない（ライブ=%s）",
    (liveChatMode) => {
      const { scrollBy, scrollHeight, getScrollTop } = renderScrollableHarness({ liveChatMode });
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByText("新着3件で完了"));

      // 通信完了と異なるタイミングで各行が描画されても、描画直後に追従を維持する。
      for (let release = 0; release < 3; release++) {
        act(() => {
          vi.advanceTimersByTime(600);
        });
        expect(getScrollTop()).toBe(scrollHeight() - 100);
        expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
        const count = scrollBy.mock.calls.length;
        act(() => {
          resizeObservers[0].trigger();
          vi.advanceTimersByTime(0);
        });
        expect(scrollBy).toHaveBeenCalledTimes(count);
      }
      expect(screen.getAllByTestId("response")).toHaveLength(5);
      expect(scrollBy).toHaveBeenCalledTimes(liveChatMode ? 3 : 1);
    },
  );

  it("スクロール通知がサイズ監視より先に届いても追従を解除しない", () => {
    const { panel, setExtraHeight, getScrollTop, scrollBy } = renderScrollableHarness();
    setExtraHeight(60);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(getScrollTop()).toBe(260);
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    act(() => {
      resizeObservers[0].trigger();
      vi.advanceTimersByTime(0);
    });
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it.each([230, 260])(
    "通常更新前にブラウザが位置を補正していれば残りの距離だけ追従する（補正後=%s）",
    (correctedScrollTop) => {
      const { setScrollTop, getScrollTop, scrollBy } = renderScrollableHarness();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      setScrollTop(correctedScrollTop);
      fireEvent.click(screen.getByText("新着ありで完了"));
      if (correctedScrollTop === 260) {
        expect(scrollBy).not.toHaveBeenCalled();
      } else {
        expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 30, behavior: "auto" });
      }
      expect(getScrollTop()).toBe(260);
    },
  );

  it("スクロールバーで上へ移動したときも新着へ引き戻さない", () => {
    const { panel, setScrollTop, getScrollTop, scrollBy } = renderScrollableHarness();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    setScrollTop(100);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    fireEvent.click(screen.getByText("新着ありで完了"));
    expect(getScrollTop()).toBe(100);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("境界の小数座標による丸め誤差では追従を解除しない", () => {
    const { panel, setBoundaryOffset } = renderScrollableHarness();
    setBoundaryOffset(0.5);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    setBoundaryOffset(2);
    fireEvent.scroll(panel);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("disabled");
  });

  it.each([false, true])(
    "通常・ライブチャットとも手動で上へ移動したら新着へ追従しない（ライブ=%s）",
    (liveChatMode) => {
      const { panel, setScrollTop, getScrollTop, scrollBy } = renderScrollableHarness({
        liveChatMode,
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.wheel(panel, { deltaY: -100 });
      setScrollTop(100);
      fireEvent.scroll(panel);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      fireEvent.click(screen.getByText("新着3件で完了"));
      act(() => {
        vi.advanceTimersByTime(1800);
      });
      expect(getScrollTop()).toBe(100);
      expect(scrollBy).not.toHaveBeenCalled();
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("disabled");
    },
  );

  it.each([false, true])(
    "手動で上へ移動した後にジェスチャーで最下部へ戻ると、新着へ追従を再開する（ライブ=%s）",
    (liveChatMode) => {
      const { panel, setScrollTop, scrollHeight, getScrollTop } = renderScrollableHarness({
        liveChatMode,
      });
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.wheel(panel, { deltaY: -100 });
      setScrollTop(100);
      fireEvent.scroll(panel);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("disabled");

      // ジェスチャーはscrollTopを直接書き換えて、scrollイベントを待たずに通知する。
      setScrollTop(scrollHeight() - 100);
      act(() => {
        panel.dispatchEvent(new Event(SCROLL_JUMP_EVENT));
      });
      fireEvent.click(screen.getByText("新着3件で完了"));
      act(() => {
        vi.advanceTimersByTime(1800);
      });
      expect(getScrollTop()).toBe(scrollHeight() - 100);
      expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
    },
  );

  it("ライブチャットでもポップアップ表示中は追従を停止する", () => {
    const { getScrollTop, scrollBy } = renderScrollableHarness({
      liveChatMode: true,
      pauseAutoScroll: true,
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.click(screen.getByText("新着3件で完了"));
    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(getScrollTop()).toBe(200);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("新着レスの描画に合わせて底面まで scrollBy する", () => {
    const onRequestRefresh = vi.fn();
    const onNewResponses = vi.fn();
    render(
      <AutoRefreshHarness onRequestRefresh={onRequestRefresh} onNewResponses={onNewResponses} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onRequestRefresh).toHaveBeenCalledOnce();

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(onNewResponses).toHaveBeenCalledOnce();
    expect(onNewResponses).toHaveBeenCalledWith(1, 2);
  });

  it("手動更新では新着レス通知を呼ばない", () => {
    const onRequestRefresh = vi.fn();
    const onNewResponses = vi.fn();
    render(
      <AutoRefreshHarness onRequestRefresh={onRequestRefresh} onNewResponses={onNewResponses} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => 300,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    fireEvent.click(screen.getByText("外部リロード開始"));
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onNewResponses).not.toHaveBeenCalled();
  });

  it("書き込みなど外部起因のリロードでも最下部にいれば追従スクロールする", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // hook のインターバルを経由しないリロード（書き込み成功後の RELOAD 相当）
    fireEvent.click(screen.getByText("外部リロード開始"));

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("更新処理外のコンテンツ高さ増加でも自動追従する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => 100,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    scrollHeightValue = 360;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("refreshKey変更時に更新前の追従位置を保存し、同じ高さ変更を二重補正しない", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    const { rerender } = render(
      <AutoRefreshHarness refreshKey={0} onRequestRefresh={onRequestRefresh} />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    // 境界はレス一覧の末尾にあるため、スクロール前は高さの増加分だけ下へ移動する。
    boundary.getBoundingClientRect = () =>
      createRect({ top: 80, bottom: scrollHeightValue - scrollTopValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // ThreadPage ではこの変更と同じ render の後に useThreadData が取得を開始する。
    // その前に layout effect が更新前の scrollHeight と追従意図を保存できることを確認する。
    act(() => {
      rerender(<AutoRefreshHarness refreshKey={1} onRequestRefresh={onRequestRefresh} />);
    });
    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 更新完了後に ResizeObserver が通知されても、同じレス描画を再度補正しない。
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("コンテンツ高さが縮小しても境界への追従位置を補正する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => 100,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    scrollHeightValue = 240;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: -60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("サイドタブバー開閉など中身の高さが変わらず容器だけ縮んでも追従を維持する", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    let clientHeightValue = 100;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => clientHeightValue,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: clientHeightValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 変更理由: 下部パネル表示などで容器だけが縮むと、中身の高さ差分だけでは底面へ戻せない。
    // 底面距離で補正して追従判定を維持する。
    clientHeightValue = 70;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 50, bottom: clientHeightValue });
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 30, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("ウィンドウリサイズでも追従位置を維持して追従判定を外さない", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    let clientHeightValue = 100;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => clientHeightValue,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: clientHeightValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 変更理由: 従来は window リサイズが単なる再判定で先に追従OFFへ倒れ、
    // ResizeObserver の補正が効かず追従が終わっていた。同じ補正経路へ一本化したため、
    // リサイズ経由でも底面へ維持される。
    scrollHeightValue = 360;
    clientHeightValue = 100;
    act(() => {
      window.dispatchEvent(new Event("resize"));
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).toHaveBeenCalledWith({ top: 60, behavior: "auto" });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("容器拡大でブラウザが既に底面へ寄せていれば二重補正しない", () => {
    const onRequestRefresh = vi.fn();
    let scrollTopValue = 200;
    const scrollHeightValue = 300;
    let clientHeightValue = 100;
    render(
      <AutoRefreshHarness
        onRequestRefresh={onRequestRefresh}
        configureScrollContainer={(scrollContainer) => {
          Object.defineProperty(scrollContainer, "clientHeight", {
            configurable: true,
            get: () => clientHeightValue,
          });
          Object.defineProperty(scrollContainer, "scrollTop", {
            configurable: true,
            get: () => scrollTopValue,
            set: (value: number) => {
              scrollTopValue = value;
            },
          });
          Object.defineProperty(scrollContainer, "scrollHeight", {
            configurable: true,
            get: () => scrollHeightValue,
          });
        }}
      />,
    );

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: clientHeightValue });
    const scrollBy = vi.fn(({ top }: ScrollToOptions) => {
      scrollTopValue += top ?? 0;
    });
    mockScrollBy(scrollContainer, scrollBy);

    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");

    // 変更理由: 容器拡大時はブラウザが scrollTop を自動でクランプして底面へ残す。
    // 差分だけで動かすと逆方向へずれるため、底面距離が0なら動かさない。
    clientHeightValue = 150;
    scrollTopValue = 150;
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: clientHeightValue });
    boundary.getBoundingClientRect = () => createRect({ top: 130, bottom: clientHeightValue });
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
    expect(screen.getByTestId("can-auto-scroll")).toHaveTextContent("enabled");
  });

  it("内容と容器の両方を監視してサイズ変更全般へ追従できる", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    // 変更理由: root だけでは容器自体の高さ変化を検知できない。
    // スクロールコンテナ自体も監視してサイズ変更全般を同じ補正へ流す。
    expect(resizeObservers).toHaveLength(1);
    expect(resizeObservers[0].observe).toHaveBeenCalledTimes(2);
  });

  it("高さ変更後もユーザーのホイール操作を優先して追従しない", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => 200,
      set: () => {},
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });
    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
    });

    fireEvent.wheel(scrollContainer);
    scrollHeightValue = 360;
    act(() => {
      resizeObservers[0].trigger();
      vi.runOnlyPendingTimers();
    });

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("アンマウント時に高さ変更の監視を解除する", () => {
    const onRequestRefresh = vi.fn();
    const { unmount } = render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    expect(resizeObservers).toHaveLength(1);
    unmount();

    expect(resizeObservers[0].disconnect).toHaveBeenCalledOnce();
  });

  it("非アクティブなパネルの高さ変更を監視しない", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness active={false} onRequestRefresh={onRequestRefresh} />);

    expect(resizeObservers).toHaveLength(0);
    expect(onRequestRefresh).not.toHaveBeenCalled();
  });

  it("自動追従前に wheel 割り込みが入ったらユーザー操作を優先する", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    const scrollBy = vi.fn();
    scrollContainer.scrollBy = scrollBy;

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    fireEvent.wheel(scrollContainer);
    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(onRequestRefresh).toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("自動スクロール表示の切り替わりで scroll/wheel リスナーを付け直さない", () => {
    const { panel, setExtraHeight, scrollBy } = renderScrollableHarness();
    const addEventListener = vi.spyOn(panel, "addEventListener");
    const removeEventListener = vi.spyOn(panel, "removeEventListener");

    // 高さが伸びて追従スクロールが走り、インジケータが点灯→消灯するまで進める。
    setExtraHeight(60);
    act(() => {
      resizeObservers[0].trigger();
      vi.advanceTimersByTime(0);
    });
    expect(scrollBy).toHaveBeenCalled();
    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("running");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");

    // 以前は表示状態を依存配列に持っていたため、点灯・消灯のたびに解除と再登録をしていた。
    expect(addEventListener).not.toHaveBeenCalled();
    expect(removeEventListener).not.toHaveBeenCalled();
  });

  it("自動スクロール状態を短時間維持してステータス表示に使える", () => {
    const onRequestRefresh = vi.fn();
    render(<AutoRefreshHarness onRequestRefresh={onRequestRefresh} />);

    const scrollContainer = screen.getByTestId("scroll-container") as HTMLDivElement;
    const boundary = screen.getByTestId("boundary") as HTMLDivElement;

    let scrollTopValue = 200;
    let scrollHeightValue = 300;
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      get: () => 100,
    });
    Object.defineProperty(scrollContainer, "scrollTop", {
      configurable: true,
      get: () => scrollTopValue,
      set: (value: number) => {
        scrollTopValue = value;
      },
    });
    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      get: () => scrollHeightValue,
    });
    scrollContainer.getBoundingClientRect = () => createRect({ top: 0, bottom: 100 });
    boundary.getBoundingClientRect = () => createRect({ top: 80, bottom: 100 });

    scrollContainer.scrollBy = vi.fn();

    act(() => {
      vi.runOnlyPendingTimers();
      vi.advanceTimersByTime(3000);
    });

    scrollHeightValue = 360;
    fireEvent.click(screen.getByText("新着ありで完了"));

    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("running");

    act(() => {
      vi.advanceTimersByTime(900);
    });

    expect(screen.getByTestId("is-auto-scrolling")).toHaveTextContent("idle");
  });

  it.each([false, true])(
    "ポップアップ中は取得を止め、閉じてから間隔を数え直す（ライブ=%s）",
    (liveChatMode) => {
      const onRequestRefresh = vi.fn();
      const { rerender } = render(
        <AutoRefreshHarness
          enabled={false}
          onRequestRefresh={onRequestRefresh}
          liveChatMode={liveChatMode}
        />,
      );
      rerender(
        <AutoRefreshHarness
          onRequestRefresh={onRequestRefresh}
          liveChatMode={liveChatMode}
          pauseAutoScroll
          pauseRefresh
        />,
      );
      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onRequestRefresh).not.toHaveBeenCalled();
      rerender(
        <AutoRefreshHarness onRequestRefresh={onRequestRefresh} liveChatMode={liveChatMode} />,
      );
      expect(onRequestRefresh).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(onRequestRefresh).toHaveBeenCalledTimes(1);
    },
  );
});
