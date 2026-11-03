interface KanaSensitiveIconProps {
  size?: number;
}

/**
 * 「ひらがなとカタカナを区別する」のアイコン。lucide に該当するものがないため、
 * 「あ」と「ア」を並べ、間に区別を示す斜線を引いて自前で描く。色は文字色に従う。
 */
export function KanaSensitiveIcon({ size = 14 }: KanaSensitiveIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <text x="0" y="9.5" fontSize="9" fontWeight="700" fontFamily="sans-serif">
        あ
      </text>
      <text x="7.5" y="15" fontSize="9" fontWeight="700" fontFamily="sans-serif">
        ア
      </text>
      <path d="M13.5 1.5 4 14.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
