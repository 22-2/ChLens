import React, { useState } from "react";

const SIDEBAR_WIDTH = 220;
const PANEL_BORDER = "1px solid #243041";
const PANEL_BG = "linear-gradient(180deg, #141922 0%, #10141c 100%)";
const PANEL_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.03), 0 14px 30px rgba(0,0,0,0.24)";

const sidebarSections = [
  {
    title: "閲覧",
    items: ["お気に入り", "履歴", "開いているスレ"],
  },
  {
    title: "クイック操作",
    items: ["未読へ移動", "画像一覧", "新着チェック"],
  },
];

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tabs] = useState(["タブ 1"]);
  const [activeTab, setActiveTab] = useState(0);

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
              ≡
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
              NAV
            </span>
          </div>
          <button title="メニュー" style={btnStyle}>
            ...
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
            width: sidebarOpen ? `${SIDEBAR_WIDTH}px` : "0",
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
                    SIDEBAR
                  </div>
                  <div
                    style={{
                      fontSize: "17px",
                      fontWeight: 600,
                      color: "#f3f6fb",
                    }}
                  >
                    ナビゲーション
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
                  OPEN
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
                  現在のボード
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#e8edf5",
                    marginBottom: "4px",
                  }}
                >
                  software
                </div>
                <div style={{ fontSize: "12px", color: "#768394" }}>
                  最近見たスレッドへすぐ戻れる想定
                </div>
              </div>

              {sidebarSections.map((section) => (
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

export default App;
