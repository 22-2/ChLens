// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";

import { evaluateBoardRules, evaluateResponseRules, matchRules } from "./engine";
import type { Rule } from "./model";

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

describe("collapseルール", () => {
  it("本文のcollapseはレスを折りたたみ、スレ一覧には適用しない", () => {
    const rules: Rule[] = [
      {
        action: "collapse",
        target: "body",
        enabled: true,
        matchers: [{ kind: "contains", value: "宣伝" }],
      },
    ];

    expect(
      evaluateResponseRules(rules, {
        all: "宣伝です",
        title: "",
        body: "宣伝です",
        name: "",
        mail: "",
        url: "",
      })?.rule.action,
    ).toBe("collapse");
    expect(evaluateBoardRules(rules, { title: "宣伝です", url: "", resCount: 1 })).toBeNull();
  });

  it("タイトルのcollapseはスレ一覧を折りたたみ、開いたスレのレスには適用しない", () => {
    const rules: Rule[] = [
      {
        action: "collapse",
        target: "title",
        enabled: true,
        matchers: [{ kind: "contains", value: "定期" }],
      },
    ];
    expect(
      evaluateBoardRules(rules, { title: "定期スレ", url: "", resCount: 1 })?.rule.action,
    ).toBe("collapse");
    expect(
      evaluateResponseRules(rules, {
        all: "本文",
        title: "定期スレ",
        body: "本文",
        name: "",
        mail: "",
        url: "",
      }),
    ).toBeNull();
    // タイトルで対象を絞り、IDの条件も指定した場合はレスの折りたたみになる。
    const scoped = [
      {
        ...rules[0],
        conditions: [
          { target: "id" as const, matchers: [{ kind: "contains" as const, value: "sample001" }] },
        ],
      },
    ];
    expect(
      evaluateResponseRules(scoped, {
        all: "本文",
        title: "定期スレ",
        body: "本文",
        id: "sample001",
        name: "",
        mail: "",
        url: "",
      })?.rule.action,
    ).toBe("collapse");
  });
});

describe("when/unlessの評価", () => {
  const context = {
    url: "https://example.com/local/",
    title: "注目",
    body: "対象",
    all: "対象",
    name: "名無し",
    mail: "",
    id: "normal",
  };
  const bodyRule: Rule = {
    action: "hide",
    target: "body",
    enabled: true,
    matchers: [{ kind: "contains", value: "対象" }],
    conditions: [
      {
        target: "id",
        negate: true,
        matchers: [
          { kind: "contains", value: "許可A" },
          { kind: "contains", value: "許可B" },
        ],
      },
    ],
  };
  it("unlessは一覧のOR全体を否定し、他の条件とANDで結合する", () => {
    expect(evaluateResponseRules([bodyRule], context)).not.toBeNull();
    for (const id of ["許可A", "許可B"])
      expect(evaluateResponseRules([bodyRule], { ...context, id })).toBeNull();
    expect(evaluateResponseRules([bodyRule], { ...context, body: "通常" })).toBeNull();
  });
  it("取得できない値や無効な正規表現をunlessで一致へ反転させない", () => {
    expect(evaluateResponseRules([bodyRule], { ...context, id: null })).toBeNull();
    const onError = vi.fn();
    const invalidRule: Rule = {
      ...bodyRule,
      conditions: [{ target: "id", negate: true, matchers: [{ kind: "regex", source: "[" }] }],
    };
    expect(evaluateResponseRules([invalidRule], context, onError)).toBeNull();
  });
  it("先頭がunlessでも全候補不一致のときだけ一致する", () => {
    const rule: Rule = { ...bodyRule, negate: true, conditions: undefined };
    expect(evaluateResponseRules([rule], context)).toBeNull();
    expect(evaluateResponseRules([rule], { ...context, body: "通常" })?.rule).toBe(rule);
  });
  it("数値比較の境界と除外条件をハイライトでも評価する", () => {
    const rule: Rule = {
      action: "highlight",
      target: "title",
      enabled: true,
      presentation: { color: "blue", label: "注目" },
      matchers: [{ kind: "contains", value: "注目" }],
      conditions: [
        { target: "res-count", comparison: ">", matchers: [{ kind: "contains", value: "10" }] },
        { target: "title", negate: true, matchers: [{ kind: "contains", value: "除外" }] },
      ],
    };
    expect(evaluateBoardRules([rule], { ...context, resCount: 10 })).toBeNull();
    expect(evaluateBoardRules([rule], { ...context, resCount: 11 })).toMatchObject({
      type: "HighlightTitle",
      params: { bgColor: "blue", label: "注目" },
    });
    expect(
      evaluateBoardRules([rule], { ...context, title: "注目・除外", resCount: 11 }),
    ).toBeNull();
  });
});
