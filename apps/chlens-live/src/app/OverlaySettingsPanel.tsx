import { useState, type ReactElement } from "react";
import {
  DEFAULT_EDGE_LIVE_VIEWER_SETTINGS,
  type EdgeLiveViewerSettings,
  type ShadowDirection,
} from "./overlay-settings";

export interface EdgeLiveViewerSettingsPanelProps {
  value: EdgeLiveViewerSettings;
  onChange: (settings: EdgeLiveViewerSettings) => void;
}

const SHADOW_DIRECTIONS: ReadonlyArray<[ShadowDirection, string]> = [
  ["top-left", "左上"],
  ["bottom-left", "左下"],
  ["top-right", "右上"],
  ["bottom-right", "右下"],
];

function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <label className="edge-settings__field">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
      <output>
        {value}
        {suffix}
      </output>
    </label>
  );
}

function NgEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
}): ReactElement {
  const [input, setInput] = useState("");
  return (
    <fieldset className="edge-settings__ng">
      <legend>{label}</legend>
      <div className="edge-settings__chips">
        {values.length === 0 ? (
          <span className="edge-settings__empty">未登録</span>
        ) : (
          values.map((value) => (
            <button
              key={value}
              type="button"
              title="クリックして削除"
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              {value} ×
            </button>
          ))
        )}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = input.trim();
          if (next && !values.includes(next)) onChange([...values, next]);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder={`${label}を入力`}
        />
        <button type="submit">追加</button>
      </form>
    </fieldset>
  );
}

export function EdgeLiveViewerSettingsPanel({
  value,
  onChange,
}: EdgeLiveViewerSettingsPanelProps): ReactElement {
  const [tab, setTab] = useState<"display" | "network" | "ng">("display");
  const patch = <K extends keyof EdgeLiveViewerSettings>(key: K, next: EdgeLiveViewerSettings[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <section className="edge-settings" aria-label="EdgeLiveViewer互換設定">
      <header>
        <div>
          <strong>実況オーバーレイ設定</strong>
          <small>変更はプレビューへ即時反映されます</small>
        </div>
        <button type="button" onClick={() => onChange({ ...DEFAULT_EDGE_LIVE_VIEWER_SETTINGS })}>
          初期設定に戻す
        </button>
      </header>
      <nav aria-label="設定カテゴリ">
        {(
          [
            ["display", "表示設定"],
            ["network", "通信・再生設定"],
            ["ng", "NG設定"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="edge-settings__body">
        {tab === "display" ? (
          <>
            <fieldset>
              <legend>フォント</legend>
              <label className="edge-settings__select">
                <span>フォント</span>
                <select
                  value={value.fontFamily}
                  onChange={(event) => patch("fontFamily", event.currentTarget.value)}
                >
                  <option>MS PGothic</option>
                  <option>Yu Gothic UI</option>
                  <option>Meiryo</option>
                  <option>Segoe UI</option>
                </select>
              </label>
              <RangeField
                label="フォントサイズ"
                value={value.fontSize}
                min={12}
                max={48}
                suffix="px"
                onChange={(next) => patch("fontSize", next)}
              />
              <RangeField
                label="フォントの太さ"
                value={value.fontWeight}
                min={100}
                max={900}
                step={50}
                suffix=""
                onChange={(next) => patch("fontWeight", next)}
              />
              <RangeField
                label="フォントの影"
                value={value.shadowSize}
                min={0}
                max={5}
                suffix="px"
                onChange={(next) => patch("shadowSize", next)}
              />
              <div className="edge-settings__checks">
                <span>影の方向</span>
                {SHADOW_DIRECTIONS.map(([id, label]) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={value.shadowDirections.includes(id)}
                      onChange={(event) =>
                        patch(
                          "shadowDirections",
                          event.currentTarget.checked
                            ? [...value.shadowDirections, id]
                            : value.shadowDirections.filter((item) => item !== id),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="edge-settings__color">
                <span>影の色</span>
                <input
                  type="color"
                  value={value.shadowColor}
                  onChange={(event) => patch("shadowColor", event.currentTarget.value)}
                />
                <code>{value.shadowColor}</code>
              </label>
              <label className="edge-settings__color">
                <span>フォント色</span>
                <input
                  type="color"
                  value={value.fontColor}
                  onChange={(event) => patch("fontColor", event.currentTarget.value)}
                />
                <code>{value.fontColor}</code>
              </label>
            </fieldset>
            <fieldset>
              <legend>表示</legend>
              <RangeField
                label="コメント速度"
                value={value.durationSeconds}
                min={2}
                max={15}
                step={0.5}
                suffix="秒"
                onChange={(next) => patch("durationSeconds", next)}
              />
              <label className="edge-settings__select">
                <span>表示位置</span>
                <select
                  value={value.displayPosition}
                  onChange={(event) =>
                    patch("displayPosition", event.currentTarget.value as "top" | "bottom")
                  }
                >
                  <option value="top">上部</option>
                  <option value="bottom">下部</option>
                </select>
              </label>
              <RangeField
                label="最大コメント数"
                value={value.maxComments}
                min={10}
                max={100}
                suffix="件"
                onChange={(next) => patch("maxComments", next)}
              />
              <RangeField
                label="コメント行間"
                value={value.spacing}
                min={0}
                max={40}
                suffix="px"
                onChange={(next) => patch("spacing", next)}
              />
              <RangeField
                label="透明度"
                value={Math.round(value.opacity * 100)}
                min={10}
                max={100}
                suffix="%"
                onChange={(next) => patch("opacity", next / 100)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={value.opaqueBackground}
                  onChange={(event) => patch("opaqueBackground", event.currentTarget.checked)}
                />
                透過なしモード（OBSクロマキー向け）
              </label>
              {value.opaqueBackground ? (
                <label className="edge-settings__color">
                  <span>背景色</span>
                  <input
                    type="color"
                    value={value.chromaKeyColor}
                    onChange={(event) => patch("chromaKeyColor", event.currentTarget.value)}
                  />
                  <code>{value.chromaKeyColor}</code>
                </label>
              ) : null}
              <label>
                <input
                  type="checkbox"
                  checked={value.hideAnchors}
                  onChange={(event) => patch("hideAnchors", event.currentTarget.checked)}
                />
                アンカー（&gt;&gt;）を含むコメントを表示しない
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={value.hideUrls}
                  onChange={(event) => patch("hideUrls", event.currentTarget.checked)}
                />
                URLを含むコメントを表示しない
              </label>
            </fieldset>
          </>
        ) : null}
        {tab === "network" ? (
          <>
            <fieldset>
              <legend>通信</legend>
              <RangeField
                label="更新間隔"
                value={value.updateIntervalSeconds}
                min={1}
                max={10}
                suffix="秒"
                onChange={(next) => patch("updateIntervalSeconds", next)}
              />
              <RangeField
                label="コメント遅延"
                value={value.commentDelaySeconds}
                min={0}
                max={300}
                suffix="秒"
                onChange={(next) => patch("commentDelaySeconds", next)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={value.autoNextThread}
                  onChange={(event) => patch("autoNextThread", event.currentTarget.checked)}
                />
                自動的に次スレを検出する
              </label>
            </fieldset>
            <fieldset>
              <legend>過去ログ再生</legend>
              <RangeField
                label="再生速度"
                value={value.playbackSpeed}
                min={1}
                max={2}
                step={0.05}
                suffix="倍"
                onChange={(next) => patch("playbackSpeed", next)}
              />
            </fieldset>
          </>
        ) : null}
        {tab === "ng" ? (
          <>
            <NgEditor
              label="NG ID"
              values={value.ngIds}
              onChange={(next) => patch("ngIds", next)}
            />
            <NgEditor
              label="NG 名前"
              values={value.ngNames}
              onChange={(next) => patch("ngNames", next)}
            />
            <NgEditor
              label="NG 本文"
              values={value.ngTexts}
              onChange={(next) => patch("ngTexts", next)}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
