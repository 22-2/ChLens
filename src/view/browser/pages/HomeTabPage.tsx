import { commandPalette } from "src/view/browser/commands/command-palette-store";
import { BoardStartPage } from "src/view/browser/pages/BoardStartPage";

// 新規タブも同じホームを表示し、URL入力の導線を既存のomnibarへ接続する。
export function HomeTabPage() {
  return (
    <BoardStartPage
      intro={
        <header className="board-start-page__intro">
          <h1 className="board-start-page__title">ホーム</h1>
          <p className="board-start-page__hint">
            <button
              type="button"
              className="board-start-page__url-link"
              onClick={() => commandPalette.open("navigation")}
            >
              URLを入力
            </button>
            するか、下の板を選んでください。
          </p>
        </header>
      }
    />
  );
}
