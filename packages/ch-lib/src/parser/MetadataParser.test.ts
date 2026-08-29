import { describe, expect, it } from "vite-plus/test";
import { extractPostDate } from "./MetadataParser";

const makeTimestamp = (weekday?: string): string => {
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10).replaceAll("-", "/");
  const time = iso.slice(11, 23);
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

  it("returns undefined when metadata does not contain a timestamp", () => {
    expect(extractPostDate("metadata only")).toBeUndefined();
  });
});
