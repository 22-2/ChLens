import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { AboutPage } from "src/view/browser/pages/AboutPage";
import { formatCompactDateTime } from "src/view/browser/utils/date-time";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// 変更理由: 表示の検証を、git の状態や vitest.config.ts の固定値に依らせないため、配布物の情報を差し替える。
const { buildInfo } = vi.hoisted(() => ({
  buildInfo: {
    version: "1.2.3",
    buildTime: "2026-10-31T03:04:05.000Z",
    gitHash: "abc1234",
    author: "テスト作者",
    license: "MIT",
    repositoryUrl: "https://example.com/test-owner/chlens",
  },
}));

vi.mock("src/app/build-info", () => ({ CHLENS_BUILD_INFO: buildInfo }));

function getDetail(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  const detail = term.nextElementSibling;
  if (!(detail instanceof HTMLElement)) throw new Error(`${label} の値が見つかりません`);
  return detail;
}

describe("ChLensについてのページ", () => {
  afterEach(() => {
    cleanup();
  });

  it("バージョン・作者・ライセンス・Gitハッシュを項目ごとに表示する", () => {
    render(<AboutPage />);

    expect(getDetail("バージョン")).toHaveTextContent("1.2.3");
    expect(getDetail("作者")).toHaveTextContent("テスト作者");
    expect(getDetail("ライセンス")).toHaveTextContent("MIT");
    expect(getDetail("Gitハッシュ")).toHaveTextContent("abc1234");
  });

  it("ビルド時刻は機械が読める日時と、画面向けの表示の両方を出す", () => {
    render(<AboutPage />);

    const time = getDetail("ビルド時刻").querySelector("time");
    expect(time).toHaveAttribute("dateTime", buildInfo.buildTime);
    expect(time).toHaveTextContent(formatCompactDateTime(Date.parse(buildInfo.buildTime)));
  });

  it("リポジトリの場所を項目に表示する", () => {
    render(<AboutPage />);

    expect(getDetail("リポジトリ")).toHaveTextContent(buildInfo.repositoryUrl);
  });
});
