import { createPortal } from "react-dom";

import { useMediaViewerController } from "../browser/use-media-viewer-controller";
import { MediaViewer } from "./MediaViewer";

interface MediaViewerContentProps {
  scopeId: string;
  isDetached: boolean;
  onDetach: () => void;
  onAttach: () => void;
  portalRoot: HTMLElement | null;
}

export function MediaViewerContent({
  scopeId,
  isDetached,
  onDetach,
  onAttach,
  portalRoot,
}: MediaViewerContentProps): React.ReactElement | null {
  // Portal先rootの差し替えをイベントeffectへ伝え、再読み込み時も新しいstageへ再接続する。
  const mediaViewerProps = useMediaViewerController(scopeId, portalRoot);
  if (!mediaViewerProps) {
    return null;
  }

  // 表示状態とイベント束縛はここで維持し、DOMだけをPortal移動してscope cleanupを避ける。
  const viewer = (
    <MediaViewer
      {...mediaViewerProps}
      isDetached={isDetached}
      onDetach={onDetach}
      onAttach={onAttach}
    />
  );
  if (isDetached && !portalRoot) {
    // popup再読み込み中に本窓へ一瞬戻すと、別窓所有中の画像が二重表示される。
    return null;
  }
  return portalRoot ? createPortal(viewer, portalRoot, "media-viewer") : viewer;
}
