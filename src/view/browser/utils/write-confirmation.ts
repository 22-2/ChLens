import DOMPurify from "dompurify";
import { createLogger } from "src/app/logger";
import type { WriteFormField } from "src/app/platform/types";

const logger = createLogger("view/browser");

const CONFIRMATION_FORM_ATTRIBUTE = "data-chlens-write-form";
const CONFIRMATION_FIELD_PREFIX = "chlens-field-";
const CONFIRMATION_ACTION_PREFIX = "https://example.invalid/";

// フォーム以外の外部読み込みや CSS は不要なため、確認と送信に必要な要素だけを残す。
const CONFIRMATION_TAGS = [
  "html",
  "head",
  "body",
  "title",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "optgroup",
  "label",
  "fieldset",
  "legend",
  "p",
  "div",
  "span",
  "br",
  "hr",
  "b",
  "strong",
  "i",
  "em",
  "small",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "pre",
  "blockquote",
];
const CONFIRMATION_ATTRIBUTES = [
  "action",
  "method",
  "name",
  "value",
  "type",
  "checked",
  "selected",
  "disabled",
  "readonly",
  "multiple",
  "required",
  "placeholder",
  "for",
  "id",
  "rows",
  "cols",
  "size",
  "maxlength",
  "minlength",
  "colspan",
  "rowspan",
  "label",
  "color",
];

export interface WriteConfirmationForm {
  id: string;
  action: string;
}

export interface WriteConfirmationPage {
  html: string;
  sourceUrl: string;
  expectedAction: string;
  charset: string;
  forms: readonly WriteConfirmationForm[];
}

export interface WriteConfirmationSubmission {
  formId: string;
  fields: readonly WriteFormField[];
}

function isAllowedWriteAction(action: string, expectedAction: string): boolean {
  try {
    const actual = new URL(action);
    const expected = new URL(expectedAction);
    return actual.origin === expected.origin && actual.pathname === expected.pathname;
  } catch (error) {
    logger.error("確認ページのフォーム送信先を解釈できませんでした:", error);
    return false;
  }
}

function resolveWriteAction(rawAction: string | null, sourceUrl: string): string | null {
  try {
    return new URL(rawAction?.trim() || sourceUrl, sourceUrl).href;
  } catch (error) {
    logger.error("確認ページの相対フォーム送信先を解決できませんでした:", error);
    return null;
  }
}

function sanitizeConfirmationDocument(
  document: Document,
  expectedAction: string,
  sourceUrl: string,
): WriteConfirmationForm[] {
  const forms: WriteConfirmationForm[] = [];
  let formIndex = 0;
  for (const form of Array.from(document.querySelectorAll("form"))) {
    const method = (form.getAttribute("method") ?? "get").toLowerCase();
    const encodedAction = form.getAttribute("action");
    if (encodedAction != null && !encodedAction.startsWith(CONFIRMATION_ACTION_PREFIX)) {
      form.remove();
      continue;
    }
    // DOMPurify が危険な action を削除すると未指定扱いになってしまうため、元の値で検証する。
    const rawAction = encodedAction?.startsWith(CONFIRMATION_ACTION_PREFIX)
      ? decodeURIComponent(encodedAction.slice(CONFIRMATION_ACTION_PREFIX.length))
      : null;
    const action = resolveWriteAction(rawAction, sourceUrl);
    if (method !== "post" || action == null || !isAllowedWriteAction(action, expectedAction)) {
      form.remove();
      continue;
    }

    const id = `form-${formIndex}`;
    formIndex += 1;
    form.setAttribute(CONFIRMATION_FORM_ATTRIBUTE, id);
    // sandboxで通常送信を止め、親画面が取得した成功コントロールをTauri HTTPへ渡す。
    form.setAttribute("action", "about:blank");
    form.setAttribute("method", "post");
    form.removeAttribute("target");
    forms.push({ id, action });
  }

  for (const input of document.querySelectorAll("input")) {
    // 添付ファイルと画像ボタンは確認フォームの送信対象にしない。
    const inputType = (input.getAttribute("type") ?? "text").toLowerCase();
    if (inputType === "file" || inputType === "image") {
      input.remove();
    }
  }

  const head =
    document.head ??
    document.documentElement.insertBefore(
      document.createElement("head"),
      document.documentElement.firstChild,
    );
  const csp = document.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content =
    "default-src 'none'; style-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'";
  head.prepend(csp);

  return forms;
}

export function createWriteConfirmationPage(
  html: string,
  sourceUrl: string,
  expectedAction: string,
  charset: string,
): WriteConfirmationPage {
  if (!DOMPurify.isSupported) {
    throw new Error("DOMPurify が使えない環境で書き込み確認ページを表示できません");
  }
  // CSS は DOMPurify の検証対象外なので許可せず、送信先検証はサニタイズ後に行う。
  // submit などの項目名は DOMPurify の DOM 衝突防止で削除される。
  // DOM 上では接頭辞を付け、送信値を収集するときだけ元の名前へ戻す。
  const purifier = DOMPurify(window);
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName === "action" && node.nodeName.toLowerCase() === "form") {
      data.attrValue = CONFIRMATION_ACTION_PREFIX + encodeURIComponent(data.attrValue);
    }
    if (
      data.attrName === "name" &&
      ["input", "button", "textarea", "select"].includes(node.nodeName.toLowerCase())
    ) {
      data.attrValue = CONFIRMATION_FIELD_PREFIX + data.attrValue;
    }
  });
  const sanitizedHtml = purifier.sanitize(html, {
    WHOLE_DOCUMENT: true,
    ALLOWED_TAGS: CONFIRMATION_TAGS,
    ALLOWED_ATTR: CONFIRMATION_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  const document = new DOMParser().parseFromString(sanitizedHtml, "text/html");
  const forms = sanitizeConfirmationDocument(document, expectedAction, sourceUrl);
  return {
    html: `<!doctype html>${document.documentElement.outerHTML}`,
    sourceUrl,
    expectedAction,
    charset,
    forms,
  };
}

function appendControlValue(
  fields: WriteFormField[],
  name: string,
  value: string,
  type: WriteFormField["type"],
): void {
  fields.push({ name, value, type });
}

export function collectWriteConfirmationFields(
  form: HTMLFormElement,
  submitter: HTMLElement | null,
): WriteFormField[] {
  const fields: WriteFormField[] = [];
  const ownerWindow = form.ownerDocument.defaultView;
  // DOMParserで作った文書にはdefaultViewがないため、画面側のWindowを代替にする。
  const HTMLElementConstructor = ownerWindow?.HTMLElement ?? HTMLElement;
  const HTMLTextAreaElementConstructor = ownerWindow?.HTMLTextAreaElement ?? HTMLTextAreaElement;
  const HTMLSelectElementConstructor = ownerWindow?.HTMLSelectElement ?? HTMLSelectElement;
  const HTMLInputElementConstructor = ownerWindow?.HTMLInputElement ?? HTMLInputElement;
  const HTMLButtonElementConstructor = ownerWindow?.HTMLButtonElement ?? HTMLButtonElement;

  for (const control of Array.from(form.elements)) {
    // 確認ページはiframe内の別Windowで生成されるため、親Windowのinstanceofでは要素を判定できない。
    if (!(control instanceof HTMLElementConstructor) || control.hasAttribute("disabled")) {
      continue;
    }
    const rawName = control.getAttribute("name") ?? "";
    const name =
      form.hasAttribute(CONFIRMATION_FORM_ATTRIBUTE) &&
      rawName.startsWith(CONFIRMATION_FIELD_PREFIX)
        ? rawName.slice(CONFIRMATION_FIELD_PREFIX.length)
        : rawName;
    if (name === "") continue;

    if (control instanceof HTMLTextAreaElementConstructor) {
      appendControlValue(fields, name, control.value, "textarea");
      continue;
    }

    if (control instanceof HTMLSelectElementConstructor) {
      for (const option of Array.from(control.selectedOptions)) {
        appendControlValue(fields, name, option.value, "input");
      }
      continue;
    }

    if (control instanceof HTMLInputElementConstructor) {
      const inputType = control.type.toLowerCase();
      if (["submit", "button", "image", "reset", "file"].includes(inputType)) {
        if (control !== submitter || inputType === "image") continue;
      }
      if (["checkbox", "radio"].includes(inputType) && !control.checked) continue;
      appendControlValue(fields, name, control.value, "input");
      continue;
    }

    if (control instanceof HTMLButtonElementConstructor) {
      if (control !== submitter || control.type.toLowerCase() !== "submit") continue;
      appendControlValue(fields, name, control.value, "input");
    }
  }

  return fields;
}

export function bindWriteConfirmationFrame(
  frame: HTMLIFrameElement,
  onSubmit: (submission: WriteConfirmationSubmission) => void,
): () => void {
  const document = frame.contentDocument;
  if (!document) return () => undefined;
  const frameWindow = document.defaultView;
  if (!frameWindow) return () => undefined;

  const cleanups: Array<() => void> = [];
  for (const form of Array.from(document.forms)) {
    const formId = form.getAttribute(CONFIRMATION_FORM_ATTRIBUTE);
    if (!formId) continue;

    const dispatchSubmission = (event: Event, submitter: HTMLElement | null) => {
      event.preventDefault();
      event.stopPropagation();
      onSubmit({
        formId,
        fields: collectWriteConfirmationFields(form, submitter),
      });
    };
    const handleSubmit = (event: Event) => {
      const submitter = (event as SubmitEvent).submitter;
      dispatchSubmission(event, submitter instanceof frameWindow.HTMLElement ? submitter : null);
    };
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof frameWindow.Element)) return;
      const submitter = target.closest("button, input");
      if (
        !(
          submitter instanceof frameWindow.HTMLButtonElement ||
          submitter instanceof frameWindow.HTMLInputElement
        )
      ) {
        return;
      }
      if (submitter.type.toLowerCase() !== "submit") return;
      dispatchSubmission(event, submitter);
    };
    form.addEventListener("submit", handleSubmit);
    form.addEventListener("click", handleClick);
    cleanups.push(() => {
      form.removeEventListener("submit", handleSubmit);
      form.removeEventListener("click", handleClick);
    });
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
