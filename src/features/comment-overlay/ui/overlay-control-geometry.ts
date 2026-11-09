import { normalizeCommentOverlayGeometry } from "../platform/geometry";
import {
  COMMENT_OVERLAY_ASPECT_RATIO,
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
} from "../platform/types";

export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 80;
export interface DesktopBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DragMode = "select" | "move" | "resize";
export type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

export function getMonitorBounds(monitor: CommentOverlayMonitor | null): DesktopBounds {
  if (monitor == null) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  return {
    x: monitor.x,
    y: monitor.y,
    width: Math.max(1, monitor.width),
    height: Math.max(1, monitor.height),
  };
}

export function clampGeometry(
  geometry: CommentOverlayGeometry,
  bounds: DesktopBounds,
  lockAspectRatio = false,
): CommentOverlayGeometry {
  const normalized = normalizeCommentOverlayGeometry(geometry);
  let width = Math.min(Math.max(MIN_WIDTH, normalized.width), Math.max(MIN_WIDTH, bounds.width));
  let height = Math.min(
    Math.max(MIN_HEIGHT, normalized.height),
    Math.max(MIN_HEIGHT, bounds.height),
  );
  if (lockAspectRatio) {
    // 画面端でも一方の寸法だけを切り詰めず、画面内に収まる16:9のサイズへ揃える。
    width = Math.max(MIN_WIDTH, Math.round(Math.min(width, height * COMMENT_OVERLAY_ASPECT_RATIO)));
    height = Math.round(width / COMMENT_OVERLAY_ASPECT_RATIO);
  }
  return {
    x: Math.min(Math.max(normalized.x, bounds.x), bounds.x + bounds.width - width),
    y: Math.min(Math.max(normalized.y, bounds.y), bounds.y + bounds.height - height),
    width,
    height,
  };
}

export function pointFromEvent(
  event: { clientX: number; clientY: number },
  svg: SVGSVGElement,
  bounds: DesktopBounds,
): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return {
    x: bounds.x + ((event.clientX - rect.left) / Math.max(1, rect.width)) * bounds.width,
    y: bounds.y + ((event.clientY - rect.top) / Math.max(1, rect.height)) * bounds.height,
  };
}

export function selectionGeometry(
  start: { x: number; y: number },
  current: { x: number; y: number },
  bounds: DesktopBounds,
  lockAspectRatio: boolean,
): CommentOverlayGeometry {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const rawWidth = Math.max(1, Math.abs(deltaX));
  const rawHeight = Math.max(1, Math.abs(deltaY));
  if (!lockAspectRatio) {
    return clampGeometry(
      {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: rawWidth,
        height: rawHeight,
      },
      bounds,
    );
  }
  let width = Math.max(MIN_WIDTH, rawWidth);
  let height = width / COMMENT_OVERLAY_ASPECT_RATIO;
  if (rawHeight < height) {
    height = Math.max(MIN_HEIGHT, rawHeight);
    width = height * COMMENT_OVERLAY_ASPECT_RATIO;
  }
  return clampGeometry(
    {
      x: deltaX < 0 ? start.x - width : start.x,
      y: deltaY < 0 ? start.y - height : start.y,
      width,
      height,
    },
    bounds,
    lockAspectRatio,
  );
}

export function movedGeometry(
  origin: CommentOverlayGeometry,
  start: { x: number; y: number },
  current: { x: number; y: number },
  bounds: DesktopBounds,
): CommentOverlayGeometry {
  return clampGeometry(
    {
      ...origin,
      x: origin.x + current.x - start.x,
      y: origin.y + current.y - start.y,
    },
    bounds,
  );
}

export function resizedGeometry(
  origin: CommentOverlayGeometry,
  start: { x: number; y: number },
  current: { x: number; y: number },
  direction: ResizeDirection,
  bounds: DesktopBounds,
  lockAspectRatio: boolean,
): CommentOverlayGeometry {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const resized: CommentOverlayGeometry = {
    x: direction.includes("West") ? origin.x + deltaX : origin.x,
    y: direction.includes("North") ? origin.y + deltaY : origin.y,
    width:
      origin.width +
      (direction.includes("West") ? -deltaX : direction.includes("East") ? deltaX : 0),
    height:
      origin.height +
      (direction.includes("North") ? -deltaY : direction.includes("South") ? deltaY : 0),
  };
  if (!lockAspectRatio) {
    // 固定OFFでは各辺を独立して動かし、最小サイズに達しても反対側の辺を移動しない。
    const width = Math.max(MIN_WIDTH, resized.width);
    const height = Math.max(MIN_HEIGHT, resized.height);
    return clampGeometry(
      {
        x: direction.includes("West") ? origin.x + origin.width - width : resized.x,
        y: direction.includes("North") ? origin.y + origin.height - height : resized.y,
        width,
        height,
      },
      bounds,
    );
  }
  const hasHorizontalHandle = direction.includes("East") || direction.includes("West");
  const hasVerticalHandle = direction.includes("North") || direction.includes("South");
  // 変更理由: 角のハンドルは動かした距離が大きい軸を基準にし、辺のハンドルは
  // その辺だけを基準にする。複雑な補正を重ねず、選択範囲と同じ16:9規則へ揃える。
  const useWidth =
    hasHorizontalHandle && (!hasVerticalHandle || Math.abs(deltaX) >= Math.abs(deltaY));
  let width = useWidth ? resized.width : resized.height * COMMENT_OVERLAY_ASPECT_RATIO;
  let height = useWidth ? resized.width / COMMENT_OVERLAY_ASPECT_RATIO : resized.height;
  width = Math.max(MIN_WIDTH, width);
  height = Math.max(MIN_HEIGHT, height);
  const next = {
    x: direction.includes("West") ? origin.x + origin.width - width : resized.x,
    y: direction.includes("North") ? origin.y + origin.height - height : resized.y,
    width,
    height,
  };
  return clampGeometry(next, bounds, lockAspectRatio);
}

export function monitorContainsPoint(
  monitor: CommentOverlayMonitor,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= monitor.x &&
    point.x <= monitor.x + monitor.width &&
    point.y >= monitor.y &&
    point.y <= monitor.y + monitor.height
  );
}

export function monitorGeometry(
  monitor: CommentOverlayMonitor,
  lockAspectRatio: boolean,
): CommentOverlayGeometry {
  return clampGeometry(
    {
      x: monitor.x,
      y: monitor.y,
      width: monitor.width,
      height: monitor.height,
    },
    getMonitorBounds(monitor),
    lockAspectRatio,
  );
}
