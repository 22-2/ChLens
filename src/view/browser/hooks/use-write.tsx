import { useCallback, useEffect, useRef, useState } from "react";
import { platform } from "src/app";
import { wait } from "src/app/Defer";
import { URL as ChURL } from "src/core/URL";
import { container } from "src/service-container/index";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import {
  notifyThreadWriteCompleted,
  type PendingWritePayload,
  resolveWriteSuccessDelayMs,
} from "src/view/browser/utils/thread-write-sync";

// -----------------------------------------------------------------------
// 定数
// -----------------------------------------------------------------------
const NAME_KEY = "readcrx_write_name";
const MAIL_KEY = "readcrx_write_mail";
// cs_write.js が ping に対して期待する応答文字列
const PONG_MSG = "write_iframe_pong";

// -----------------------------------------------------------------------
// 型
// -----------------------------------------------------------------------
export type WriteStatus =
  | "idle"
  | "submitting"
  | "confirm"
  | "success"
  | "error";

interface WriteFormData {
  action: string;
  charset: string;
  input: Record<string, string>;
  textarea: Record<string, string>;
}

export interface UseWriteResult {
  name: string;
  mail: string;
  sage: boolean;
  message: string;
  status: WriteStatus;
  statusText: string;
  canSubmit: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  setName: (v: string) => void;
  setMail: (v: string) => void;
  setSage: (v: boolean) => void;
  setMessage: (v: string) => void;
  submit: () => Promise<void>;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
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

// -----------------------------------------------------------------------
// フック本体
// -----------------------------------------------------------------------
export function useWrite(threadUrl: string): UseWriteResult {
  const { dispatch } = useTabStore();

  const [name, setNameState] = useState(
    () =>
      localStorage.getItem(NAME_KEY) ??
      container.config.get("default_name") ??
      "",
  );
  const [mail, setMailState] = useState(
    () =>
      localStorage.getItem(MAIL_KEY) ??
      container.config.get("default_mail") ??
      "",
  );
  const [sage, setSage] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [statusText, setStatusText] = useState("");

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingSubmittedWriteRef = useRef<PendingWritePayload | null>(null);

  const canSubmit =
    status === "idle" && threadUrl !== "" && message.trim() !== "";

  // 名前・メールを localStorage に保存
  const setName = useCallback((v: string) => {
    setNameState(v);
    localStorage.setItem(NAME_KEY, v);
  }, []);

  const setMail = useCallback((v: string) => {
    setMailState(v);
    localStorage.setItem(MAIL_KEY, v);
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

  // iframe からの postMessage を処理する (cs_write.js との通信)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; message?: unknown };
      switch (data?.type) {
        case "ping":
          (e.source as Window | null)?.postMessage(PONG_MSG, "*");
          break;
        case "success":
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
          // 確認ページが表示された: iframe を見せてユーザーに操作させる
          setStatus("confirm");
          setStatusText("確認ページが表示されています");
          break;
        case "error":
          pendingSubmittedWriteRef.current = null;
          setStatus("error");
          setStatusText(
            data.message
              ? `書き込み失敗: ${data.message}`
              : "書き込みに失敗しました",
          );
          break;
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [dispatch]);

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

    pendingSubmittedWriteRef.current = {
      threadUrl,
      message,
      inputName: name,
      inputMail: effectiveMail,
    };

    setStatus("submitting");
    setStatusText("書き込み中...");

    await setupHeaderModifier(formData.action);

    const iframe = iframeRef.current;
    if (!iframe) {
      pendingSubmittedWriteRef.current = null;
      return;
    }

    // 空ページをロードしてから iframe の contentDocument にフォームを生成して送信する。
    // submit_res.js の _setupForm と同じアプローチ。
    const onLoad = () => {
      iframe.removeEventListener("load", onLoad);
      const doc = iframe.contentDocument;
      if (!doc) return;

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
    iframe.src = "/view/empty.html";
  }, [canSubmit, threadUrl, name, mail, sage, message]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await submit();
    },
    [submit],
  );

  const handleRetry = useCallback(() => {
    pendingSubmittedWriteRef.current = null;
    setStatus("idle");
    setStatusText("");
  }, []);

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
