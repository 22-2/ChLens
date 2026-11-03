interface KanaSensitiveIconProps {
  size?: number;
}

/**
 * 「ひらがなとカタカナを区別する」のアイコン。lucide の CaseSensitive（Aa）に合わせ、
 * 大きい「あ」と小さい「ア」を同じ基線で並べる。色は文字色に従う。
 */
export function KanaSensitiveIcon({ size = 14 }: KanaSensitiveIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <text x="0.5" y="17.5" fontSize="14" fontWeight="500" fontFamily="sans-serif">
        あ
      </text>
      <text x="13.5" y="17.5" fontSize="10.5" fontWeight="500" fontFamily="sans-serif">
        ア
      </text>
    </svg>
  );
}
