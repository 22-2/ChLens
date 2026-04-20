import React from "react";
import { useMediaViewerController } from "src/view/browser/hooks/use-media-viewer-controller";
import { MediaViewer } from "src/view/browser/components/MediaViewer";

export function MediaViewerContainer(): JSX.Element | null {
  const mediaViewerProps = useMediaViewerController();
  if (!mediaViewerProps) {
    return null;
  }

  // 表示コンポーネントを純粋描画に保つため、状態参照とイベント束縛はここで完結させる。
  return <MediaViewer {...mediaViewerProps} />;
}
