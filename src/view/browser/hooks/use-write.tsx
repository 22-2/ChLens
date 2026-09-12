import { type FormEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { platform } from "src/app";
import { wait } from "src/app/Defer";
import { isTauriRuntime } from "src/app/platform/runtime";
import type { HttpResponse, WriteFormData } from "src/app/platform/types";
import { getStore2String, setStore2String } from "src/app/Store2Storage";
import { URL as ChURL } from "src/core/URL";
import { container } from "src/service-container/index";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  notifyThreadWriteCompleted,
  notifyThreadWriteStarted,
  type PendingWritePayload,
  resolveWriteSuccessDelayMs,
} from "src/view/browser/utils/thread-write-sync";
import { classifyWriteResult, type WriteResultMessage } from "src/view/browser/utils/write-result";

// -----------------------------------------------------------------------
// 定数
// -----------------------------------------------------------------------
const NAME_KEY = "chlens_write_name";
const MAIL_KEY = "chlens_write_mail";
// sageの切り替えは投稿ごとではなく設定画面で管理し、パネルを簡潔に保つ。
const SAGE_CONFIG_KEY = "sage_flag";
// cs_write.js が ping に対して期待する応答文字列
const PONG_MSG = "write_iframe_pong";
// postMessage を受け取れない環境でも「書き込み中...」で固着しないための上限待機時間
const SUBMIT_WATCHDOG_MS = 20_000;

// -----------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------
export type WriteStatus = "idle" | "submitting" | "confirm" | "success" | "error";

export interface UseWriteResult {
  name: string;
  mail: string;
  sage: boolean;
  message: string;
  status: WriteStatus;
  statusText: string;
  canSubmit: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  setName: (v: string) => void;
  setMail: (v: string) => void;
  setSage: (v: boolean) => void;
  setMessage: (v: string) => void;
  submit: () => Promise<void>;
  handleSubmit: (e: FormEvent) => Promise<void>;
  handleRetry: () => void;
}

// -----------------------------------------------------------------------
// 純粋関数: BBS種別に応じたフォームデータを組み立てる
// submit_res.js の _getFormData に相当
// -----------------------------------------------------------------------
function buildFormData(
  threadUrl: string,
  name: string,
  mail: string,
  message: string,
): WriteFormData | null {
  let url: ChURL;
  try {
    url = new ChURL(threadUrl);
  } catch {
    return null;
  }

  const { bbsType } = url.guessType();
  const tsld = url.getTsld();
  const { protocol, hostname } = url;
  const parts = url.pathname.split("/");

  if (bbsType === "2ch") {
    if (tsld === "open2ch.net") {
      return {
        action: `${protocol}//${hostname}/test/bbs.cgi`,
        charset: "UTF-8",
        input: { submit: "書", bbs: parts[3], key: parts[4], FROM: name, mail },
        textarea: { MESSAGE: message },
      };
    }
    // eddibb は submit ラベルが異なる
    const submitLabel = hostname === "bbs.eddibb.cc" ? "書き込む" : "書きこむ";
    return {
      action: `${protocol}//${hostname}/test/bbs.cgi`,
      charset: "Shift_JIS",
      input: {
        submit: submitLabel,
        time: String(Math.floor(Date.now() / 1000) - 60),
        bbs: parts[3],
        key: parts[4],
        FROM: name,
        mail,
        oekaki_thread1: "",
      },
      textarea: { MESSAGE: message },
    };
  }

  if (bbsType === "jbbs") {
    return {
      action: `${protocol}//jbbs.shitaraba.net/bbs/write.cgi/${parts[3]}/${parts[4]}/${parts[5]}/`,
      charset: "EUC-JP",
      input: {
        TIME: String(Math.floor(Date.now() / 1000) - 60),
        DIR: parts[3],
        BBS: parts[4],
        KEY: parts[5],
        NAME: name,
        MAIL: mail,
      },
      textarea: { MESSAGE: message },
    };
  }

  if (bbsType === "machi") {
    return {
      action: `${protocol}//${hostname}/bbs/write.cgi`,
      charset: "Shift_JIS",
      input: {
        submit: "書きこむ",
        TIME: String(Math.floor(Date.now() / 1000) - 60),
        BBS: parts[3],
        KEY: parts[4],
        NAME: name,
        MAIL: mail,
      },
      textarea: { MESSAGE: message },
    };
  }

  return null;
}

// -----------------------------------------------------------------------
// 純粋関数: declarativeNetRequest でリクエストヘッダーを書き換える
// (プラットフォーム抽象化レイヤーへ委譲)
// -----------------------------------------------------------------------
async function setupHeaderModifier(formAction: string): Promise<void> {
  await platform.http.setupWriteHeaders(formAction);
}

function parseTauriWriteResult(
  response: HttpResponse,
  fallbackUrl: string,
): WriteResultMessage | null {
  const resultDocument = new DOMParser().parseFromString(response.body, "text/html");
  const refreshContent = Array.from(resultDocument.getElementsByTagName("meta"))
    .find((element) => element.httpEquiv?.toLowerCase() === "refresh")
    ?.getAttribute("content");
  const fontText = Array.from(
    resultDocument.getElementsByTagName("font"),
    (font) => font.textContent ?? "",
  ).join("\n");

  return classifyWriteResult({
    url: response.url || fallbackUrl,
    title: resultDocument.title,
    bodyText: resultDocument.body?.textContent ?? resultDocument.documentElement.textContent ?? "",
    fontText,
    refreshContent: refreshContent ?? undefined,
  });
}

async function submitTauriWrite(formData: WriteFormData): Promise<WriteResultMessage> {
  const { encodeWriteForm } = await import("src/app/platform/tauri/WriteForm");
  const actionOrigin = new URL(formData.action).origin;
  const response = await platform.http.fetch(formData.action, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // 変更理由: Tauri HTTPはWebViewのOriginを自動付与するため、
      // 拡張機能版のdeclarativeNetRequestと同じ投稿先Originへ明示的に揃える。
      Origin: actionOrigin,
      Referer: formData.action,
    },
    body: encodeWriteForm(formData),
    mimeType: `text/html; charset=${formData.charset}`,
  });

  const result = parseTauriWriteResult(response, formData.action);
  if (result != null) {
    return result;
  }

  return {
    type: "error",
    message: `書き込み結果を判定できませんでした (HTTP ${response.status})`,
  };
}

// -----------------------------------------------------------------------
// フック本体
// -----------------------------------------------------------------------
export function useWrite(threadUrl: string): UseWriteResult {
  const { dispatch } = useTabStore();

  const [name, setNameState] = useState(
    () => getStore2String(NAME_KEY) ?? container.config.get("default_name") ?? "",
  );
  const [mail, setMailState] = useState(
    () => getStore2String(MAIL_KEY) ?? container.config.get("default_mail") ?? "",
  );
  const [sage, setSage] = useState(() => container.config.get(SAGE_CONFIG_KEY) === "on");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [statusText, setStatusText] = useState("");

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingSubmittedWriteRef = useRef<PendingWritePayload | null>(null);
  const submitWatchdogTimerRef = useRef<number | null>(null);
  const statusRef = useRef<WriteStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const handleConfigUpdated = ({ key }: { key?: string }) => {
      if (key !== SAGE_CONFIG_KEY) {
        return;
      }
      setSage(container.config.get(SAGE_CONFIG_KEY) === "on");
    };

    container.message.on("config_updated", handleConfigUpdated);
    return () => {
      container.message.off("config_updated", handleConfigUpdated);
    };
  }, []);

  const clearSubmitWatchdog = useCallback(() => {
    const timerId = submitWatchdogTimerRef.current;
    if (timerId == null) {
      return;
    }
    window.clearTimeout(timerId);
    submitWatchdogTimerRef.current = null;
  }, []);

  const armSubmitWatchdog = useCallback(() => {
    clearSubmitWatchdog();
    submitWatchdogTimerRef.current = window.setTimeout(() => {
      if (statusRef.current !== "submitting") {
        return;
      }

      pendingSubmittedWriteRef.current = null;
      console.error("書き込み結果の通知を受信できませんでした");
      // 変更理由: 通知欠落は投稿成否を確認できない失敗なので、通常のidleへ戻すと
      // 警告がボタン下へ残り、共通の失敗ダイアログにも表示されなくなる。
      setStatus("error");
      setStatusText("書き込み結果の通知を受信できなかったため待機を解除しました");
    }, SUBMIT_WATCHDOG_MS);
  }, [clearSubmitWatchdog]);

  useEffect(() => clearSubmitWatchdog, [clearSubmitWatchdog]);

  const canSubmit = status === "idle" && threadUrl !== "" && message.trim() !== "";

  // 名前・メールを localStorage に保存
  const setName = useCallback((v: string) => {
    setNameState(v);
    void setStore2String(NAME_KEY, v);
  }, []);

  const setMail = useCallback((v: string) => {
    setMailState(v);
    void setStore2String(MAIL_KEY, v);
  }, []);

  // 書き込み成功後、少し待ってから idle に戻す
  useEffect(() => {
    if (status !== "success") return;
    const id = setTimeout(() => {
      setStatus("idle");
      setStatusText("");
    }, 3000);
    return () => clearTimeout(id);
  }, [status]);

  const handleWriteResult = useCallback(
    (data: WriteResultMessage) => {
      switch (data.type) {
        case "success":
          clearSubmitWatchdog();
          setStatus("success");
          setStatusText("書き込みました");
          setMessage("");

          void (async () => {
            const delayMs = resolveWriteSuccessDelayMs(data.message);
            const pendingSubmittedWrite = pendingSubmittedWriteRef.current;
            pendingSubmittedWriteRef.current = null;

            // 変更理由: 旧UIは投稿完了ページが要求する待ち時間だけ待ってから再取得しており、
            // 即 reload すると dat 反映前の内容を掴んで「もう一度更新しないと見えない」回帰になる。
            await wait(delayMs);

            if (pendingSubmittedWrite) {
              notifyThreadWriteCompleted(pendingSubmittedWrite);
            }

            // 変更理由: 投稿後の強制再取得も通常の RELOAD 経路へ寄せ、
            // manual reload / auto refresh と同じ forceUpdate 振る舞いを保つ。
            dispatch({ type: "RELOAD" });
          })();
          break;
        case "confirm":
          clearSubmitWatchdog();
          // 確認ページが表示された: iframe を見せてユーザーに操作させる
          setStatus("confirm");
          setStatusText("確認ページが表示されています");
          break;
        case "error":
          clearSubmitWatchdog();
          pendingSubmittedWriteRef.current = null;
          setStatus("error");
          setStatusText(
            data.message ? `書き込み失敗: ${String(data.message)}` : "書き込みに失敗しました",
          );
          break;
      }
    },
    [clearSubmitWatchdog, dispatch],
  );

  // iframe からの postMessage を処理する (cs_write.js との通信)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; message?: unknown };
      switch (data?.type) {
        case "ping":
          (e.source as Window | null)?.postMessage(PONG_MSG, "*");
          break;
        case "success":
          handleWriteResult({
            type: "success",
            message:
              typeof data.message === "number" || typeof data.message === "string"
                ? data.message
                : undefined,
          });
          break;
        case "confirm":
          handleWriteResult({ type: "confirm" });
          break;
        case "error":
          handleWriteResult({
            type: "error",
            message: typeof data.message === "string" ? data.message : undefined,
          });
          break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleWriteResult]);

  const submit = useCallback(async () => {
    if (!canSubmit) return;

    const effectiveMail = sage ? "sage" : mail;
    const formData = buildFormData(threadUrl, name, effectiveMail, message);
    if (!formData) {
      pendingSubmittedWriteRef.current = null;
      setStatus("error");
      setStatusText("このURLへの書き込み形式を判定できませんでした");
      return;
    }

    const submittedAt = Date.now();
    pendingSubmittedWriteRef.current = {
      threadUrl,
      message,
      inputName: name,
      inputMail: effectiveMail,
      submittedAt,
    };

    // 変更理由: ベースラインを送信時点で確定させる。3 秒の待機中に自動更新が走ると
    // responseCountRef が新着込みの値に更新され、hasAdvancedSinceSubmit が永久に
    // false になる競合を防ぐため、送信直後に同期イベントで通知する。
    notifyThreadWriteStarted({ threadUrl, submittedAt });

    setStatus("submitting");
    setStatusText("書き込み中...");
    const useTauriHttp = isTauriRuntime();
    if (!useTauriHttp) {
      armSubmitWatchdog();
    }

    try {
      await setupHeaderModifier(formData.action);
    } catch (error) {
      console.error("書き込み用リクエストヘッダーの設定に失敗しました:", error);
      handleWriteResult({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (useTauriHttp) {
      try {
        handleWriteResult(await submitTauriWrite(formData));
      } catch (error) {
        console.error("Tauri版の書き込みに失敗しました:", error);
        handleWriteResult({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    const iframe = iframeRef.current;
    if (!iframe) {
      console.error("書き込みフォームのiframeを初期化できませんでした");
      handleWriteResult({ type: "error", message: "書き込みフォームを初期化できませんでした" });
      return;
    }

    // about:blank をロードしてから iframe の contentDocument にフォームを生成して送信する。
    // 拡張機能内の未配置ファイル（/view/empty.html）に依存すると、ビルド成果物で
    // ERR_FILE_NOT_FOUND になり content script へ投稿結果が通知されないため、
    // 作成元の拡張ページと同一オリジンを継承する about:blank を使う。
    // submit_res.js の _setupForm と同じアプローチ。
    const onLoad = () => {
      iframe.removeEventListener("load", onLoad);
      const doc = iframe.contentDocument;
      if (!doc) {
        console.error("書き込みフォームのiframe文書を取得できませんでした");
        handleWriteResult({
          type: "error",
          message: "書き込みフォームを初期化できませんでした",
        });
        return;
      }

      const form = doc.createElement("form");
      form.acceptCharset = formData.charset;
      form.action = formData.action;
      form.method = "POST";

      for (const [key, val] of Object.entries(formData.input)) {
        const input = doc.createElement("input");
        input.name = key;
        input.value = val;
        form.appendChild(input);
      }
      for (const [key, val] of Object.entries(formData.textarea)) {
        const ta = doc.createElement("textarea");
        ta.name = key;
        ta.textContent = val;
        form.appendChild(ta);
      }

      doc.body.appendChild(form);
      // prototype 経由で呼ぶことで React が合成したイベントをバイパスする
      Object.getPrototypeOf(form).submit.call(form);
    };

    iframe.addEventListener("load", onLoad);
    iframe.src = "about:blank";
  }, [
    armSubmitWatchdog,
    canSubmit,
    clearSubmitWatchdog,
    handleWriteResult,
    threadUrl,
    name,
    mail,
    sage,
    message,
  ]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await submit();
    },
    [submit],
  );

  const handleRetry = useCallback(() => {
    clearSubmitWatchdog();
    pendingSubmittedWriteRef.current = null;
    setStatus("idle");
    setStatusText("");
  }, [clearSubmitWatchdog]);

  return {
    name,
    mail,
    sage,
    message,
    status,
    statusText,
    canSubmit,
    iframeRef,
    setName,
    setMail,
    setSage,
    setMessage,
    submit,
    handleSubmit,
    handleRetry,
  };
}
