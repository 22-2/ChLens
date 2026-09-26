export type WriteWarning = {
  category: string;
  reason: string;
};

// 変更理由: 投稿に個人情報や脅迫表現が混ざったまま公開される事故を減らしつつ、
// 引用や説明文の誤検知で投稿を妨げないよう、一致箇所は送信禁止ではなく確認対象にする。
const WRITE_WARNING_RULES: Array<{ category: string; reason: string; pattern: RegExp }> = [
  {
    category: "メールアドレス",
    reason: "連絡先が公開される可能性があります。",
    pattern: /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/i,
  },
  {
    category: "電話番号",
    reason: "本人や第三者へ連絡できる情報が含まれている可能性があります。",
    // 変更理由: 認証トークンなど英数字列に埋め込まれた数字を電話番号と誤認せず、国内・国番号付きの両形式を検出する。
    pattern:
      /(?<![A-Za-z0-9])(?:\+?81[-‐ー ]?0?|0)\d{1,4}[-‐ー ]?\d{1,4}[-‐ー ]?\d{3,4}(?![A-Za-z0-9])/,
  },
  {
    category: "住所・郵便番号",
    reason: "住所を特定できる情報が含まれている可能性があります。",
    // 変更理由: 認証トークンや電話番号の一部にある数字列を郵便番号と誤認しないよう、英数字境界と番号の続きの有無を確認する。
    pattern:
      /(?<![A-Za-z0-9])〒?\d{3}[-ー ]?\d{4}(?![A-Za-z0-9]|[-‐ー ]\d)|(?:北海道|東京都|京都府|大阪府|.{2,3}県).{0,24}?(?:市|区|町|村).{0,20}?\d+[丁目番地号-]?/,
  },
  {
    category: "ファイルパス",
    reason: "ユーザー名や端末内のフォルダー構成が公開される可能性があります。",
    pattern:
      /(?:\b[A-Za-z]:\\(?:Users|Documents and Settings|家|ユーザー)\\|\\\\[^\\\s]+\\[^\\\s]+|(?:^|\s)\/(?:Users|home|root|私人|var\/www)\/[^\s]+)/i,
  },
  {
    category: "IPアドレス",
    reason: "接続元やネットワークを特定できる情報が含まれている可能性があります。",
    pattern: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/,
  },
  {
    category: "パスワード・認証情報",
    reason: "アカウントやサービスへアクセスされる危険があります。",
    pattern: /(?:password|passwd|パスワード|秘密鍵|api[_ -]?key|access[_ -]?token)\s*[:=：]\s*\S+/i,
  },
  {
    category: "脅迫・危害を示す表現",
    reason:
      "脅迫と受け取られる表現が含まれている可能性があります。投稿前に文脈と表現を確認してください。",
    pattern:
      /(?:殺害予告|殺すぞ|殺してやる|爆破予告|爆破する|爆破してやる|爆弾を(?:仕掛|しか|置|お)|襲撃予告)/,
  },
];

/** 投稿本文や名前・メール欄に、公開を再確認したい情報や表現がないか調べる。 */
export function findWriteWarnings(values: string[]): WriteWarning[] {
  const text = values.join("\n");
  return WRITE_WARNING_RULES.filter(({ pattern }) => pattern.test(text)).map(
    ({ category, reason }) => ({ category, reason }),
  );
}
