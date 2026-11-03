import { CaseSensitive, Regex } from "lucide-react";
import { KanaSensitiveIcon } from "src/view/browser/ui/KanaSensitiveIcon";
import { compileSearch, type SearchOptions } from "src/view/browser/utils/search-normalize";

interface SearchOptionTogglesProps {
  options: SearchOptions;
  onChange: (options: SearchOptions) => void;
  className?: string;
}

const ICON_SIZE = 14;

/**
 * 検索欄の右端に置く、検索条件の切り替えボタン（大文字小文字・かな・正規表現）。
 * スレフィルタ・スレ一覧フィルタ・サイドバーの抽出・ページ内検索で同じ見た目と文言にそろえる。
 */
export function SearchOptionToggles({ options, onChange, className }: SearchOptionTogglesProps) {
  const toggles = [
    {
      key: "caseSensitive",
      label: "大文字と小文字を区別",
      icon: <CaseSensitive size={ICON_SIZE} aria-hidden="true" />,
    },
    {
      key: "kanaSensitive",
      label: "ひらがなとカタカナを区別",
      icon: <KanaSensitiveIcon size={ICON_SIZE} />,
    },
    {
      key: "regex",
      label: "正規表現",
      icon: <Regex size={ICON_SIZE} aria-hidden="true" />,
    },
  ] as const;

  return (
    <span className={["search-option-toggles", className].filter(Boolean).join(" ")}>
      {toggles.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          className="search-option-toggles__button icon-button"
          aria-pressed={options[key]}
          aria-label={label}
          title={label}
          onClick={() => onChange({ ...options, [key]: !options[key] })}
        >
          {icon}
        </button>
      ))}
    </span>
  );
}

/** 正規表現が不正なときの理由。入力欄の `aria-invalid` と説明に使う。正しい・空なら null。 */
export function getSearchError(query: string, options: SearchOptions): string | null {
  return options.regex ? compileSearch(query.trim(), options).error : null;
}
