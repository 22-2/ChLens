import { describe, expect, it } from "vite-plus/test";
import { extractPostDate } from "./PostDateParser";

const makeTimestamp = (weekday?: string, includeSeconds = true): string => {
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10).replaceAll("-", "/");
  const time = includeSeconds ? iso.slice(11, 23) : iso.slice(11, 16);
  return `${date}${weekday == null ? "" : `(${weekday})`} ${time}`;
};

describe("extractPostDate", () => {
  it("extracts a timestamp with a one-character weekday", () => {
    const timestamp = makeTimestamp("X");

    expect(extractPostDate(timestamp)).toBe(timestamp);
  });

  it("extracts a timestamp with a multi-character weekday", () => {
    const timestamp = makeTimestamp("weekday");

    expect(extractPostDate(`${timestamp} extra metadata`)).toBe(timestamp);
  });

  it("extracts a timestamp without a weekday", () => {
    const timestamp = makeTimestamp();

    expect(extractPostDate(timestamp)).toBe(timestamp);
  });

  it("extracts a timestamp without seconds", () => {
    const timestamp = makeTimestamp(undefined, false);

    expect(extractPostDate(timestamp)).toBe(timestamp);
  });

  it("returns undefined when metadata does not contain a timestamp", () => {
    expect(extractPostDate("metadata only")).toBeUndefined();
  });
});
