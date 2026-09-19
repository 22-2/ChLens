import { useMediaViewerController } from "../browser/use-media-viewer-controller";
import { MediaViewer } from "./MediaViewer";

interface MediaViewerContainerProps {
  scopeId: string;
}

export function MediaViewerContainer({
  scopeId,
}: MediaViewerContainerProps): React.ReactElement | null {
  const mediaViewerProps = useMediaViewerController(scopeId);
  if (!mediaViewerProps) {
    return null;
  }

  // 表示コンポーネントを純粋描画に保つため、状態参照とイベント束縛はここで完結させる。
  return <MediaViewer {...mediaViewerProps} />;
}
