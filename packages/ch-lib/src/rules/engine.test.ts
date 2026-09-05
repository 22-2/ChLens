import { evaluateBoardRules, evaluateResponseRules, matchRules } from "./engine";
import type { Rule } from "./model";
import { describe, expect, it, vi } from "vite-plus/test";

const HIDE = new Set<Rule["action"]>(["hide"]);
const HIGHLIGHT = new Set<Rule["action"]>(["highlight"]);
const BOARD_TARGETS = new Set<Rule["target"]>(["all", "title", "url", "res-count"]);
const THREAD_TARGETS = new Set<Rule["target"]>([
  "all",
  "title",
  "url",
  "reply-count",
  "anchor-count",
]);
const RESPONSE_TARGETS = new Set<Rule["target"]>([
  "all",
  "body",
  "name",
  "mail",
  "id",
  "slip",
  "url",
  "reply-count",
  "anchor-count",
]);
const BODY = new Set<Rule["target"]>(["body"]);
const RES_COUNT = new Set<Rule["target"]>(["res-count"]);
const ANCHOR_COUNT = new Set<Rule["target"]>(["anchor-count"]);

describe("rule engine", () => {
  it("keeps board/thread-list and response evaluation as explicit APIs", () => {
    const rules: Rule[] = [
      {
        action: "hide",
        target: "title",
        enabled: true,
        matchers: [{ kind: "contains", value: "注目" }],
      },
      {
        action: "hide",
        target: "body",
        enabled: true,
        matchers: [{ kind: "contains", value: "荒らし" }],
      },
    ];

    expect(
      evaluateBoardRules(rules, {
        title: "注目スレ",
        url: "https://bbs.eddibb.cc/liveedge/",
        resCount: 12,
      })?.type,
    ).toBe("Title");
    expect(
      evaluateResponseRules(rules, {
        all: "name 荒らし本文",
        title: "注目スレ",
        body: "荒らし本文",
        name: "name",
        mail: "",
        url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
      })?.type,
    ).toBe("Title");
    expect(
      evaluateResponseRules(rules.slice(1), {
        all: "name 荒らし本文",
        title: "通常スレ",
        body: "荒らし本文",
        name: "name",
        mail: "",
        url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
      })?.type,
    ).toBe("Body");
  });

  it("evaluates typed contains and regex matchers directly", () => {
    const rules: Rule[] = [
      {
        action: "hide",
        target: "body",
        enabled: true,
        matchers: [
          { kind: "contains", value: "荒らし" },
          { kind: "regex", source: "imgur\\.com" },
        ],
      },
    ];
    expect(
      matchRules(rules, { body: "これは荒らし", url: "https://example.com" }, HIDE, BODY)?.type,
    ).toBe("Body");
    expect(
      matchRules(rules, { body: "https://imgur.com/a", url: "https://example.com" }, HIDE, BODY)
        ?.type,
    ).toBe("RegExpBody");
  });

  it("reports an invalid regex once and skips it", () => {
    const onError = vi.fn();
    const rules: Rule[] = [
      {
        action: "hide",
        target: "body",
        enabled: true,
        matchers: [{ kind: "regex", source: "[" }],
      },
    ];
    expect(
      matchRules(rules, { body: "x", url: "https://example.com" }, HIDE, BODY, onError),
    ).toBeNull();
    expect(
      matchRules(rules, { body: "x", url: "https://example.com" }, HIDE, BODY, onError),
    ).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("matches res-count at the configured threshold", () => {
    const rules: Rule[] = [
      {
        action: "hide",
        target: "res-count",
        enabled: true,
        matchers: [{ kind: "contains", value: "10" }],
      },
    ];

    expect(
      matchRules(rules, { resCount: 9, url: "https://example.com" }, HIDE, RES_COUNT),
    ).toBeNull();
    expect(
      matchRules(rules, { resCount: 10, url: "https://example.com" }, HIDE, RES_COUNT)?.type,
    ).toBe("ResCount");
  });

  it("matches anchor-count at the configured threshold", () => {
    const rules: Rule[] = [
      {
        action: "hide",
        target: "anchor-count",
        enabled: true,
        matchers: [{ kind: "contains", value: "3" }],
      },
    ];

    expect(
      matchRules(rules, { anchorCount: 2, url: "https://example.com" }, HIDE, ANCHOR_COUNT),
    ).toBeNull();
    expect(
      matchRules(rules, { anchorCount: 3, url: "https://example.com" }, HIDE, ANCHOR_COUNT)?.type,
    ).toBe("AnchorCount");
  });

  it("すべての条件を要求し、1条件内のmatcherはORのまま維持する", () => {
    const rules: Rule[] = [
      {
        action: "highlight",
        target: "title",
        enabled: true,
        matchers: [
          { kind: "contains", value: "注目" },
          { kind: "contains", value: "重要" },
        ],
        conditions: [
          {
            target: "res-count",
            matchers: [{ kind: "contains", value: "100" }],
          },
        ],
      },
    ];

    expect(
      matchRules(
        rules,
        { title: "注目スレ", url: "https://example.com/board/", resCount: 99 },
        HIGHLIGHT,
        BOARD_TARGETS,
      ),
    ).toBeNull();
    expect(
      matchRules(
        rules,
        { title: "通常スレ", url: "https://example.com/board/", resCount: 100 },
        HIGHLIGHT,
        BOARD_TARGETS,
      ),
    ).toBeNull();
    expect(
      matchRules(
        rules,
        { title: "重要スレ", url: "https://example.com/board/", resCount: 100 },
        HIGHLIGHT,
        BOARD_TARGETS,
      )?.type,
    ).toBe("HighlightTitle");
  });

  it("board・thread・responseで同じscopeを適用し、対象外fieldは判定しない", () => {
    // 変更理由: DSL evaluatorをLiveと共有する前に、製品ごとのadapterが許可対象だけを渡せば
    // 同じrule sourceでもboard／thread／responseの境界を維持できることを固定する。
    const rules: Rule[] = [
      {
        action: "hide",
        target: "title",
        enabled: true,
        scope: { sites: ["bbs.eddibb.cc"] },
        matchers: [{ kind: "contains", value: "注目" }],
      },
      {
        action: "hide",
        target: "body",
        enabled: true,
        scope: { sites: ["bbs.eddibb.cc"] },
        matchers: [{ kind: "contains", value: "荒らし" }],
      },
      {
        action: "highlight",
        target: "title",
        enabled: true,
        scope: { sites: ["bbs.eddibb.cc"] },
        matchers: [{ kind: "contains", value: "注目" }],
      },
    ];

    expect(
      matchRules(
        rules,
        { title: "注目スレ", url: "https://bbs.eddibb.cc/liveedge/" },
        HIDE,
        BOARD_TARGETS,
      )?.type,
    ).toBe("Title");
    expect(
      matchRules(
        rules,
        {
          title: "注目スレ",
          body: "荒らし本文",
          url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1/",
        },
        HIDE,
        THREAD_TARGETS,
      )?.type,
    ).toBe("Title");
    expect(
      matchRules(
        rules,
        { body: "荒らし本文", url: "https://bbs.eddibb.cc/test/read.cgi/liveedge/1/" },
        HIDE,
        RESPONSE_TARGETS,
      )?.type,
    ).toBe("Body");
    expect(
      matchRules(
        rules,
        { body: "荒らし本文", url: "https://example.com/test/read.cgi/liveedge/1/" },
        HIDE,
        RESPONSE_TARGETS,
      ),
    ).toBeNull();
    expect(
      matchRules(
        rules,
        { title: "注目スレ", url: "https://bbs.eddibb.cc/liveedge/" },
        HIGHLIGHT,
        BOARD_TARGETS,
      )?.type,
    ).toBe("HighlightTitle");
  });
});
