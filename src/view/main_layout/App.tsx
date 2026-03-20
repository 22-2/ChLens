import React, { useState } from "react";
import {
  BookOpen,
  Clock3,
  FolderOpen,
  Image,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from "lucide-react";

const SIDEBAR_WIDTH = 220;
const PANEL_BORDER = "1px solid #243041";
const PANEL_BG = "linear-gradient(180deg, #141922 0%, #10141c 100%)";
const PANEL_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 30px rgba(0,0,0,0.24)";

const sidebarViews = {
  boards: {
    label: "ボード",
    heading: "ボード一覧",
    badge: "BOARD",
    description: "巡回する板やカテゴリを切り替える想定",
    sections: [
      {
        title: "よく見る板",
        items: ["software", "pc", "net", "unix"],
      },
      {
        title: "ショートカット",
        items: ["新着あり", "勢い順", "お気に入り板"],
      },
    ],
  },
  threads: {
    label: "スレッド",
    heading: "開いているスレ",
    badge: "THREAD",
    description: "作業中のスレや追跡中の話題を切り替える想定",
    sections: [
      {
        title: "現在のタブ",
        items: ["質問スレ", "雑談スレ", "不具合報告"],
      },
      {
        title: "操作",
        items: ["未読へ移動", "次スレ候補", "レス抽出"],
      },
    ],
  },
  history: {
    label: "履歴",
    heading: "閲覧履歴",
    badge: "HISTORY",
    description: "直近で開いたスレやボードへ戻る想定",
    sections: [
      {
        title: "最近見た項目",
        items: ["朝の巡回", "画像スレ", "技術メモ"],
      },
      {
        title: "保存済み",
        items: ["あとで読む", "調査中", "書き込み候補"],
      },
    ],
  },
  media: {
    label: "メディア",
    heading: "画像とリンク",
    badge: "MEDIA",
    description: "画像・動画・外部リンクをまとめて確認する想定",
    sections: [
      {
        title: "表示",
        items: ["画像一覧", "動画リンク", "外部URL"],
      },
      {
        title: "整理",
        items: ["ぼかし解除", "保存候補", "NGメディア"],
      },
    ],
  },
  search: {
    label: "検索",
    heading: "検索と抽出",
    badge: "SEARCH",
    description: "スレ内検索や条件抽出に寄せた表示",
    sections: [
      {
        title: "検索対象",
        items: ["本文", "ID", "アンカー", "画像レス"],
      },
      {
        title: "フィルター",
        items: ["未読のみ", "自分宛て", "リンク付き"],
      },
    ],
  },
  settings: {
    label: "設定",
    heading: "表示設定",
    badge: "CONFIG",
    description: "密度や表示モードを調整するペイン想定",
    sections: [
      {
        title: "表示密度",
        items: ["標準", "コンパクト", "広め"],
      },
      {
        title: "モード",
        items: ["ライブ", "巡回", "省メモリ"],
      },
    ],
  },
} as const;

type SidebarViewKey = keyof typeof sidebarViews;

const activityItems: Array<{
  key: SidebarViewKey;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { key: "boards", label: "ボード", icon: FolderOpen },
  { key: "threads", label: "スレッド", icon: MessageSquare },
  { key: "history", label: "履歴", icon: Clock3 },
  { key: "media", label: "メディア", icon: Image },
  { key: "search", label: "検索", icon: Search },
  { key: "settings", label: "設定", icon: Settings },
];

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tabs] = useState(["タブ 1"]);
  const [activeTab, setActiveTab] = useState(0);
  const [activeSidebarView, setActiveSidebarView] =
    useState<SidebarViewKey>("threads");

  const activeSidebar = sidebarViews[activeSidebarView];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(56,189,248,0.08), transparent 22%), #0b0f15",
        color: "#e2e8f0",
        padding: "10px",
        gap: "10px",
        boxSizing: "border-box",
        fontFamily:
          '"Segoe UI", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", sans-serif',
      }}
    >
      {/* ヘッダー行 */}
      <div style={{ display: "flex", gap: "10px", height: "44px" }}>
        {/* 左メニューバー */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            width: `${SIDEBAR_WIDTH}px`,
            padding: "0 10px",
            border: PANEL_BORDER,
            borderRadius: "10px",
            background: PANEL_BG,
            boxShadow: PANEL_SHADOW,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title="サイドバー開閉"
              style={btnStyle}
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <div
              style={{
                width: "1px",
                height: "18px",
                background: "rgba(148, 163, 184, 0.18)",
              }}
            />
            <span
              style={{
                fontSize: "12px",
                letterSpacing: "0.08em",
                color: "#9aa6b2",
              }}
            >
              {activeSidebar.badge}
            </span>
          </div>
          <button title="メニュー" style={btnStyle}>
            <BookOpen size={16} />
          </button>
        </div>

        {/* タブバー */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "0 8px",
            border: PANEL_BORDER,
            borderRadius: "10px",
            background: PANEL_BG,
            boxShadow: PANEL_SHADOW,
            overflowX: "auto",
          }}
        >
          {tabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              style={{
                ...btnStyle,
                padding: "7px 14px",
                borderRadius: "7px",
                background:
                  activeTab === i
                    ? "linear-gradient(180deg, #334155 0%, #2b3445 100%)"
                    : "transparent",
                boxShadow:
                  activeTab === i
                    ? "inset 0 1px 0 rgba(255,255,255,0.05)"
                    : "none",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* コンテンツ行 */}
      <div
        style={{
          flex: 1,
          display: "flex",
          gap: "10px",
          overflow: "hidden",
        }}
      >
        {/* サイドバー */}
        <div
          style={{
            width: sidebarOpen ? `${SIDEBAR_WIDTH + 56}px` : "0",
            flexShrink: 0,
            border: sidebarOpen ? PANEL_BORDER : "none",
            borderRadius: "18px",
            overflow: "hidden",
            transition: "width 0.24s ease",
            background: sidebarOpen ? PANEL_BG : "transparent",
            boxShadow: sidebarOpen ? PANEL_SHADOW : "none",
          }}
        >
          {sidebarOpen && (
            <div
              style={{
                height: "100%",
                display: "flex",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: "56px",
                  padding: "12px 8px",
                  borderRight: "1px solid rgba(148, 163, 184, 0.12)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(7, 10, 16, 0.22)",
                }}
              >
                {activityItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.key === activeSidebarView;

                  return (
                    <button
                      key={item.key}
                      title={item.label}
                      onClick={() => setActiveSidebarView(item.key)}
                      style={{
                        ...activityButtonStyle,
                        background: isActive
                          ? "linear-gradient(180deg, rgba(59,130,246,0.22) 0%, rgba(56,189,248,0.16) 100%)"
                          : "transparent",
                        borderColor: isActive
                          ? "rgba(103, 232, 249, 0.34)"
                          : "transparent",
                        color: isActive ? "#eff8ff" : "#8ea0b5",
                        boxShadow: isActive
                          ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(103,232,249,0.06)"
                          : "none",
                      }}
                    >
                      <Icon size={18} strokeWidth={1.8} />
                    </button>
                  );
                })}

                <div style={{ flex: 1 }} />

                <button title="サイドバー開閉" onClick={() => setSidebarOpen(false)} style={activityButtonStyle}>
                  <PanelLeftClose size={18} strokeWidth={1.8} />
                </button>
              </div>

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-28px",
                    right: "-18px",
                    width: "96px",
                    height: "96px",
                    borderRadius: "999px",
                    background:
                      "radial-gradient(circle, rgba(56,189,248,0.14) 0%, rgba(56,189,248,0) 70%)",
                    pointerEvents: "none",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "8px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "11px",
                        letterSpacing: "0.12em",
                        color: "#7f8a98",
                        marginBottom: "6px",
                      }}
                    >
                      {activeSidebar.badge}
                    </div>
                    <div
                      style={{
                        fontSize: "17px",
                        fontWeight: 600,
                        color: "#f3f6fb",
                      }}
                    >
                      {activeSidebar.heading}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "4px 8px",
                      borderRadius: "999px",
                      background: "rgba(71, 85, 105, 0.34)",
                      border: "1px solid rgba(148, 163, 184, 0.14)",
                      color: "#b7c0cc",
                      fontSize: "11px",
                    }}
                  >
                    {activeSidebar.label}
                  </span>
                </div>

                <div
                  style={{
                    padding: "12px",
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(148, 163, 184, 0.08)",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#9aa6b2",
                      marginBottom: "8px",
                    }}
                  >
                    現在の表示
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#e8edf5",
                      marginBottom: "4px",
                    }}
                  >
                    {activeSidebar.heading}
                  </div>
                  <div style={{ fontSize: "12px", color: "#768394" }}>
                    {activeSidebar.description}
                  </div>
                </div>

                {activeSidebar.sections.map((section) => (
                  <div key={section.title}>
                    <div
                      style={{
                        fontSize: "11px",
                        letterSpacing: "0.08em",
                        color: "#7f8a98",
                        marginBottom: "8px",
                      }}
                    >
                      {section.title}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {section.items.map((item) => (
                        <button key={item} style={sidebarItemStyle}>
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "999px",
                              background: "#67e8f9",
                              boxShadow: "0 0 12px rgba(103,232,249,0.4)",
                              flexShrink: 0,
                            }}
                          />
                          <span>{item}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: "12px",
                    borderTop: "1px solid rgba(148, 163, 184, 0.14)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    color: "#8d99a8",
                    fontSize: "12px",
                  }}
                >
                  <span>表示密度</span>
                  <span>標準</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* メインコンテンツ */}
        <div
          style={{
            flex: 1,
            border: PANEL_BORDER,
            borderRadius: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            background:
              "linear-gradient(180deg, rgba(20,25,34,0.96) 0%, rgba(13,17,24,0.96) 100%)",
            boxShadow: PANEL_SHADOW,
          }}
        >
          <span style={{ color: "#718096", fontSize: "28px", fontWeight: 600 }}>
            スレ画面
          </span>
        </div>
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.02)",
  border: "1px solid rgba(148, 163, 184, 0.12)",
  color: "#e2e8f0",
  cursor: "pointer",
  fontSize: "16px",
  padding: "6px 8px",
  borderRadius: "8px",
  lineHeight: 1,
};

const sidebarItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  padding: "10px 12px",
  borderRadius: "12px",
  border: "1px solid rgba(148, 163, 184, 0.08)",
  background: "rgba(255,255,255,0.025)",
  color: "#dbe4ee",
  cursor: "pointer",
  textAlign: "left",
  fontSize: "13px",
};

const activityButtonStyle: React.CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  border: "1px solid transparent",
  background: "transparent",
  color: "#8ea0b5",
  cursor: "pointer",
  transition: "all 0.18s ease",
};

export default App;
