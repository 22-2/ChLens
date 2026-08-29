import { describe, expect, it } from "vite-plus/test";
import { BBSMenuParser } from "../parser/BBSMenuParser";

describe("BBSMenuParser", () => {
  it("BBSメニューのHTMLを解析する", () => {
    const html = `
      <BR><BR><B>Category 1</B><BR>
      <A HREF=http://board1.5ch.io/test/>Board 1</A><BR>
      <A HREF=http://board2.5ch.io/test/>Board 2</A><BR>
      <BR><BR><B>Category 2</B><BR>
      <A HREF=http://board3.5ch.io/test/>Board 3</A><BR>
    `;

    const result = BBSMenuParser.parse(html);
    expect(result).toHaveLength(2);

    expect(result[0].title).toBe("Category 1");
    expect(result[0].boards).toHaveLength(2);
    expect(result[0].boards[0].title).toBe("Board 1");
    expect(result[0].boards[0].url).toBe("http://board1.5ch.io/test/");

    expect(result[1].title).toBe("Category 2");
    expect(result[1].boards).toHaveLength(1);
    expect(result[1].boards[0].title).toBe("Board 3");
  });
});
