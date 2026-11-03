import { Check, ChevronDown, Ellipsis } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ContextMenu, type ContextMenuItem } from "src/view/browser/ui/ContextMenu";
import {
  compileSearch,
  DEFAULT_SEARCH_OPTIONS,
  type SearchOptions,
} from "src/view/browser/utils/search-normalize";

interface SearchOptionsMenuProps {
  options: SearchOptions;
  onChange: (options: SearchOptions) => void;
  /**
   * 検索の条件のチェック項目より前に並べる項目（スレフィルタの「種類」など）。
   * 渡すと、ボタンは「絞り込み ▼」のように文字つきで出る。
   */
  leadingItems?: ContextMenuItem[];
  /** 文字つきのボタンの表示。省略すると「⋯」だけのボタンにする。 */
  label?: string;
  /** メニューの中で既定から外れた条件があるとき true。閉じていても効いていると分かるよう強調する。 */
  active?: boolean;
  className?: string;
}

const OPTION_LABELS: { key: keyof SearchOptions; label: string }[] = [
  { key: "caseSensitive", label: "大文字と小文字を区別" },
  { key: "kanaSensitive", label: "ひらがなとカタカナを区別" },
  { key: "regex", label: "正規表現" },
];

function hasNonDefaultOption(options: SearchOptions): boolean {
  return OPTION_LABELS.some(({ key }) => options[key] !== DEFAULT_SEARCH_OPTIONS[key]);
}

/** 項目の先頭の印。選んでいる項目だけにチェックを出し、位置はそろえる。 */
export function checkIcon(checked: boolean) {
  return checked ? <Check size={16} aria-hidden="true" /> : <span />;
}

/**
 * 検索欄の右端に置く、検索の条件（大文字小文字・かな・正規表現）のメニュー。
 * スレフィルタ・スレ一覧フィルタ・サイドバーの抽出・ページ内検索で、同じ文言と見た目にそろえる。
 */
export function SearchOptionsMenu({
  options,
  onChange,
  leadingItems,
  label,
  active = false,
  className,
}: SearchOptionsMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  const toggle = useCallback(() => {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ x: rect.left, y: rect.bottom });
  }, [position]);

  const items = useMemo<ContextMenuItem[]>(() => {
    const optionItems = OPTION_LABELS.map(({ key, label: optionLabel }) => ({
      id: `option-${key}`,
      label: optionLabel,
      checked: options[key],
      icon: checkIcon(options[key]),
      onSelect: () => onChange({ ...options, [key]: !options[key] }),
    }));
    return leadingItems?.length
      ? [...leadingItems, { id: "options-separator", separator: true }, ...optionItems]
      : optionItems;
  }, [leadingItems, onChange, options]);

  const highlighted = active || hasNonDefaultOption(options);
  const accessibleName = label ?? "検索の条件";
  return (
    <span className={["search-options-menu", className].filter(Boolean).join(" ")}>
      <button
        ref={buttonRef}
        type="button"
        className={`search-options-menu__button icon-button${
          label ? " search-options-menu__button--labeled" : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={position !== null}
        aria-label={accessibleName}
        title={accessibleName}
        data-active={highlighted ? "true" : undefined}
        onClick={toggle}
      >
        {label ? (
          <>
            <span>{label}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </>
        ) : (
          <Ellipsis size={14} aria-hidden="true" />
        )}
      </button>
      {position ? (
        <ContextMenu
          x={position.x}
          y={position.y}
          items={items}
          onClose={() => setPosition(null)}
          triggerRef={buttonRef}
          enableKeyboardNavigation
        />
      ) : null}
    </span>
  );
}

/** 正規表現が不正なときの理由。入力欄の `aria-invalid` と説明に使う。正しい・空なら null。 */
export function getSearchError(query: string, options: SearchOptions): string | null {
  return options.regex ? compileSearch(query.trim(), options).error : null;
}
