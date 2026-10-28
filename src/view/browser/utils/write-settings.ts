/** 書き込み設定の項目名と説明を設定画面と投稿欄で共有する。 */
export const WRITE_SETTING_COPY = {
  default_name: { title: "名前", description: "書き込みの名前欄に入力する文字列です。" },
  default_mail: {
    title: "メール",
    description: "メール欄に入力する文字列です。sageで書き込む場合は sage と入力します。",
  },
  write_submit_ctrl_enter: {
    title: "Ctrl+Enterで書き込む",
    description: "本文入力中にCtrl+Enter（Macは⌘+Enter）で投稿します。",
  },
  write_pre_submit_warnings: {
    title: "投稿前に確認する",
    description: "個人情報や危害表現が含まれる場合に確認を表示します。",
  },
  write_sanitize_urls_on_paste: {
    title: "貼り付け時にURLパラメータを除去する",
    description:
      "URLを貼り付けると追跡用パラメータを除去します。Instagramはクエリ全体を除去します。",
  },
} as const;
