import React from "react";
import { useTabStore } from "src/view/browser/hooks/use-tab-store";
import { useWrite } from "src/view/browser/hooks/use-write";

export const WritePanelContent: React.FC = () => {
  const { currentPage } = useTabStore();
  const threadUrl = currentPage.type === "thread" ? currentPage.threadUrl : "";

  const {
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
    handleSubmit,
    handleRetry,
  } = useWrite(threadUrl);

  const isSubmitting = status === "submitting";
  const isConfirm = status === "confirm";

  return (
    <div className="write-panel">
      {isConfirm ? (
        <div className="write-panel__confirm">
          <div className="write-panel__confirm-bar">
            <span>{statusText}</span>
            <button
              type="button"
              className="write-panel__btn write-panel__btn--secondary"
              onClick={handleRetry}
            >
              戻る
            </button>
          </div>
          <iframe
            ref={iframeRef}
            className="write-panel__iframe write-panel__iframe--visible"
            title="書き込み確認"
          />
        </div>
      ) : (
        <form className="write-panel__form" onSubmit={handleSubmit}>
          <div className="write-panel__header-row">
            <label className="write-panel__field-group">
              <span className="write-panel__field-label">名前</span>
              <input
                className="write-panel__input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                placeholder="名無し"
              />
            </label>
            <label className="write-panel__field-group write-panel__field-group--grow">
              <span className="write-panel__field-label">メール</span>
              <input
                className="write-panel__input"
                type="text"
                value={mail}
                onChange={(e) => setMail(e.target.value)}
                disabled={isSubmitting || sage}
                placeholder=""
              />
            </label>
            <label className="write-panel__sage">
              <input
                type="checkbox"
                checked={sage}
                onChange={(e) => setSage(e.target.checked)}
                disabled={isSubmitting}
              />
              sage
            </label>
          </div>
          <div className="write-panel__body-row">
            <textarea
              className="write-panel__textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isSubmitting}
              placeholder={
                threadUrl
                  ? "本文を入力..."
                  : "スレッドを開いてから書き込んでください"
              }
            />
            <div className="write-panel__side">
              <button
                type="submit"
                className="write-panel__btn write-panel__btn--primary"
                disabled={!canSubmit}
              >
                書き込む
              </button>
              {status === "error" && (
                <button
                  type="button"
                  className="write-panel__btn write-panel__btn--secondary"
                  onClick={handleRetry}
                >
                  再入力
                </button>
              )}
              {statusText && (
                <span
                  className={`write-panel__status write-panel__status--${status}`}
                >
                  {statusText}
                </span>
              )}
            </div>
          </div>
          {/* 常に DOM に存在させてリフを有効に保つ。通常は非表示 */}
          <iframe
            ref={iframeRef}
            className="write-panel__iframe"
            title="write-iframe"
            aria-hidden="true"
          />
        </form>
      )}
    </div>
  );
};
