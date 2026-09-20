import {
  bindWriteConfirmationFrame,
  collectWriteConfirmationFields,
  createWriteConfirmationPage,
} from "src/view/browser/utils/write-confirmation";
import { describe, expect, it, vi } from "vite-plus/test";

const SOURCE_URL = "https://example.com/test/bbs.cgi";

describe("Tauri版の書き込み確認ページ", () => {
  it("確認HTMLを表示用に隔離し、同一の書き込みフォームだけを残す", () => {
    const page = createWriteConfirmationPage(
      `<!doctype html><html><head><script>alert('x')</script><style>body{color:red}</style></head><body>
        <form method="post" action="/test/bbs.cgi?guid=ON">
          <input type="hidden" name="token" value="abc">
          <input name="MESSAGE" value="本文">
          <button type="submit" name="submit" value="承諾して書き込む">承諾して書き込む</button>
        </form>
        <form method="post" action="https://other.example.com/test/bbs.cgi"><input name="evil" value="1"></form>
        <img src="https://other.example.com/tracker.gif" onerror="alert('x')">
      </body></html>`,
      SOURCE_URL,
      SOURCE_URL,
      "Shift_JIS",
    );

    expect(page.forms).toEqual([
      { id: "form-0", action: "https://example.com/test/bbs.cgi?guid=ON" },
    ]);
    expect(page.html).not.toContain("<script");
    expect(page.html).not.toContain("other.example.com");
    expect(page.html).toContain('data-chlens-write-form="form-0"');
    expect(page.html).toContain('action="about:blank"');
  });

  it("確認ボタンを含むHTMLフォームのsuccessful controlsを順序付きで取得する", () => {
    const page = createWriteConfirmationPage(
      `<form method="post" action="${SOURCE_URL}">
        <input type="hidden" name="token" value="abc">
        <input type="checkbox" name="agree" value="yes" checked>
        <input type="checkbox" name="skip" value="no">
        <textarea name="MESSAGE">一行目\n二行目</textarea>
        <select name="mode"><option value="normal" selected>通常</option><option value="other">別</option></select>
        <button type="submit" name="submit" value="承諾">承諾</button>
      </form>`,
      SOURCE_URL,
      SOURCE_URL,
      "UTF-8",
    );
    const document = new DOMParser().parseFromString(page.html, "text/html");
    const form = document.forms[0];
    const button = form.querySelector("button");
    if (!form || !button) throw new Error("確認フォームを取得できませんでした");

    expect(collectWriteConfirmationFields(form, button)).toEqual([
      { name: "token", value: "abc", type: "input" },
      { name: "agree", value: "yes", type: "input" },
      { name: "MESSAGE", value: "一行目\n二行目", type: "textarea" },
      { name: "mode", value: "normal", type: "input" },
      { name: "submit", value: "承諾", type: "input" },
    ]);
  });

  it("sandboxでフォーム送信が止まっても確認ボタンのクリックを親へ渡す", () => {
    const frame = document.createElement("iframe");
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error("確認iframeの文書を取得できませんでした");
    frameDocument.body.innerHTML = `<form data-chlens-write-form="form-0"><input name="token" value="abc"><button type="submit" name="submit" value="承諾">承諾</button></form>`;
    const onSubmit = vi.fn();
    const cleanup = bindWriteConfirmationFrame(frame, onSubmit);
    const button = frameDocument.querySelector("button");
    if (!button) throw new Error("確認ボタンを取得できませんでした");

    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(onSubmit).toHaveBeenCalledWith({
      formId: "form-0",
      fields: [
        { name: "token", value: "abc", type: "input" },
        { name: "submit", value: "承諾", type: "input" },
      ],
    });
    cleanup();
    frame.remove();
  });
});
