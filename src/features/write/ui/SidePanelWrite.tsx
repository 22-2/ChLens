import { WritePanelContent } from "src/features/write/ui/WritePanelContent";
import { StatusBar, StatusBarProvider } from "src/view/browser/components/StatusBar";

/**
 * 書き込みセッションの表示先の1つとしてサイドパネルに書き込み欄を置く。
 * サイドパネルはペインの外にあり、ペインの状態バーへ送信状態を出せないため、別窓と同じく専用の状態バーを持つ。
 */
export function SidePanelWrite() {
  return (
    <StatusBarProvider>
      <div className="side-panel__content side-panel__write">
        <WritePanelContent place="side" />
      </div>
      <StatusBar />
    </StatusBarProvider>
  );
}
