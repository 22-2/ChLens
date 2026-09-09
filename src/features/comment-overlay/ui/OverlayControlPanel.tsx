import {
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  COMMENT_OVERLAY_ASPECT_RATIO,
  DEFAULT_COMMENT_OVERLAY_GEOMETRY,
  type CommentOverlayGeometry,
  type CommentOverlayMonitor,
} from "../platform/types";
import { normalizeCommentOverlayGeometry } from "../platform/geometry";
import "./OverlayControlPanel.css";

const MIN_WIDTH = 320;
const MIN_HEIGHT = 80;

interface DesktopBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode = "select" | "move" | "resize";
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

interface DragState {
  mode: DragMode;
  pointerId: number;
  start: { x: number; y: number };
  origin: CommentOverlayGeometry;
  direction?: ResizeDirection;
}

const RESIZE_HANDLES: ReadonlyArray<{
  direction: ResizeDirection;
  cursor: string;
}> = [
  { direction: "NorthWest", cursor: "nwse-resize" },
  { direction: "North", cursor: "ns-resize" },
  { direction: "NorthEast", cursor: "nesw-resize" },
  { direction: "East", cursor: "ew-resize" },
  { direction: "SouthEast", cursor: "nwse-resize" },
  { direction: "South", cursor: "ns-resize" },
  { direction: "SouthWest", cursor: "nesw-resize" },
  { direction: "West", cursor: "ew-resize" },
];

export interface OverlayControlPanelProps {
  monitors: readonly CommentOverlayMonitor[];
  geometry?: CommentOverlayGeometry | null;
  onGeometryChange: (geometry: CommentOverlayGeometry) => void;
}

function getDesktopBounds(monitors: readonly CommentOverlayMonitor[]): DesktopBounds {
  if (monitors.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const minX = Math.min(...monitors.map((monitor) => monitor.x));
  const minY = Math.min(...monitors.map((monitor) => monitor.y));
  const maxX = Math.max(...monitors.map((monitor) => monitor.x + monitor.width));
  const maxY = Math.max(...monitors.map((monitor) => monitor.y + monitor.height));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function clampGeometry(
  geometry: CommentOverlayGeometry,
  bounds: DesktopBounds,
): CommentOverlayGeometry {
  const normalized = normalizeCommentOverlayGeometry(geometry);
  const width = Math.min(Math.max(MIN_WIDTH, normalized.width), Math.max(MIN_WIDTH, bounds.width));
  const height = Math.min(
    Math.max(MIN_HEIGHT, normalized.height),
    Math.max(MIN_HEIGHT, bounds.height),
  );
  return {
    x: Math.min(Math.max(normalized.x, bounds.x), bounds.x + bounds.width - width),
    y: Math.min(Math.max(normalized.y, bounds.y), bounds.y + bounds.height - height),
    width,
    height,
  };
}

function pointFromEvent(
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

function selectionGeometry(
  start: { x: number; y: number },
  current: { x: number; y: number },
  bounds: DesktopBounds,
): CommentOverlayGeometry {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const rawWidth = Math.max(1, Math.abs(deltaX));
  const rawHeight = Math.max(1, Math.abs(deltaY));
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
  );
}

function movedGeometry(
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

function resizedGeometry(
  origin: CommentOverlayGeometry,
  start: { x: number; y: number },
  current: { x: number; y: number },
  direction: ResizeDirection,
  bounds: DesktopBounds,
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
  // 変更理由: Overlayの表示倍率はウィンドウの縦横比から決まるため、操作パネルでも
  // 常に16:9を維持し、フォントとコメントの移動距離を一様に拡縮する。
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
  return clampGeometry(next, bounds);
}

function monitorContainsPoint(
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

function monitorGeometry(monitor: CommentOverlayMonitor): CommentOverlayGeometry {
  return normalizeCommentOverlayGeometry({
    x: monitor.x,
    y: monitor.y,
    width: monitor.width,
    height: monitor.height,
  });
}

export function OverlayControlPanel({
  monitors,
  geometry = DEFAULT_COMMENT_OVERLAY_GEOMETRY,
  onGeometryChange,
}: OverlayControlPanelProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<CommentOverlayGeometry | null>(null);
  const bounds = useMemo(() => getDesktopBounds(monitors), [monitors]);
  const currentGeometry = clampGeometry(geometry ?? DEFAULT_COMMENT_OVERLAY_GEOMETRY, bounds);
  const displayedGeometry = dragPreview ?? currentGeometry;
  const selectedMonitor = useMemo(() => {
    const center = {
      x: currentGeometry.x + currentGeometry.width / 2,
      y: currentGeometry.y + currentGeometry.height / 2,
    };
    return monitors.find((monitor) => monitorContainsPoint(monitor, center)) ?? null;
  }, [currentGeometry, monitors]);

  const startDrag = (
    event: ReactPointerEvent<SVGElement>,
    mode: DragMode,
    direction?: ResizeDirection,
  ): void => {
    if (event.button !== 0 || !svgRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const start = pointFromEvent(event, svgRef.current, bounds);
    const next: DragState = {
      mode,
      pointerId: event.pointerId,
      start,
      origin: currentGeometry,
      ...(direction ? { direction } : {}),
    };
    dragRef.current = next;
    if (typeof svgRef.current.setPointerCapture === "function") {
      svgRef.current.setPointerCapture(event.pointerId);
    }
    setDragPreview(currentGeometry);
  };

  const updateDrag = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current || event.pointerId !== drag.pointerId) return;
    const current = pointFromEvent(event, svgRef.current, bounds);
    const next =
      drag.mode === "select"
        ? selectionGeometry(drag.start, current, bounds)
        : drag.mode === "move"
          ? movedGeometry(drag.origin, drag.start, current, bounds)
          : resizedGeometry(
              drag.origin,
              drag.start,
              current,
              drag.direction ?? "SouthEast",
              bounds,
            );
    setDragPreview(next);
    // 変更理由: パネル内の選択範囲とnative Overlayを同時に追従させ、離した瞬間だけ
    // 反映される遅延感をなくす。呼び出し元でIPCを適宜まとめられる契約にする。
    onGeometryChange(next);
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (
      svgRef.current &&
      typeof svgRef.current.hasPointerCapture === "function" &&
      svgRef.current.hasPointerCapture(event.pointerId)
    ) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragPreview(null);
  };

  const handleMonitorDoubleClick = (
    event: ReactMouseEvent<SVGElement>,
    monitor: CommentOverlayMonitor,
  ): void => {
    // 変更理由: Overlay自身は常時クリック透過なので、ディスプレイ単位の操作は
    // この仮想画面からgeometryを直接作り、実ウィンドウへ遠隔反映する。
    event.preventDefault();
    event.stopPropagation();
    onGeometryChange(monitorGeometry(monitor));
  };

  const handleReset = (): void => {
    onGeometryChange(clampGeometry(DEFAULT_COMMENT_OVERLAY_GEOMETRY, bounds));
  };

  return (
    <section className="overlay-control-panel" data-testid="overlay-control-panel">
      <header className="overlay-control-panel__header">
        <div>
          <h2>コメント表示領域</h2>
          <p>仮想ディスプレイ上で範囲を指定します。</p>
        </div>
        <button type="button" onClick={handleReset}>
          初期位置
        </button>
      </header>

      {monitors.length === 0 ? (
        <p className="overlay-control-panel__empty" role="status">
          ディスプレイ情報を取得できません。
        </p>
      ) : (
        <>
          <svg
            ref={svgRef}
            className="overlay-control-panel__desktop"
            data-testid="overlay-control-panel-desktop"
            viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="仮想デスクトップ"
            onPointerMove={updateDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <rect
              className="overlay-control-panel__desktop-background"
              x={bounds.x}
              y={bounds.y}
              width={bounds.width}
              height={bounds.height}
              data-overlay-control-background="true"
              onPointerDown={(event) => startDrag(event, "select")}
            />
            {monitors.map((monitor) => (
              <g
                key={monitor.id}
                className={`overlay-control-panel__monitor${
                  selectedMonitor?.id === monitor.id
                    ? " overlay-control-panel__monitor--selected"
                    : ""
                }`}
                data-monitor-id={monitor.id}
              >
                <rect
                  x={monitor.x}
                  y={monitor.y}
                  width={monitor.width}
                  height={monitor.height}
                  className="overlay-control-panel__monitor-screen"
                  onPointerDown={(event) => startDrag(event, "select")}
                  onDoubleClick={(event) => handleMonitorDoubleClick(event, monitor)}
                />
                <text
                  x={monitor.x + monitor.width / 2}
                  y={monitor.y + monitor.height / 2}
                  className="overlay-control-panel__monitor-label"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {monitor.name}
                </text>
              </g>
            ))}
            <rect
              className="overlay-control-panel__selection"
              data-testid="overlay-control-panel-selection"
              x={displayedGeometry.x}
              y={displayedGeometry.y}
              width={displayedGeometry.width}
              height={displayedGeometry.height}
              onPointerDown={(event) => startDrag(event, "move")}
              onDoubleClick={(event) => {
                if (selectedMonitor) handleMonitorDoubleClick(event, selectedMonitor);
              }}
            />
            {RESIZE_HANDLES.map(({ direction, cursor }) => {
              const x = direction.includes("West")
                ? displayedGeometry.x
                : direction.includes("East")
                  ? displayedGeometry.x + displayedGeometry.width
                  : displayedGeometry.x + displayedGeometry.width / 2;
              const y = direction.includes("North")
                ? displayedGeometry.y
                : direction.includes("South")
                  ? displayedGeometry.y + displayedGeometry.height
                  : displayedGeometry.y + displayedGeometry.height / 2;
              return (
                <rect
                  key={direction}
                  className="overlay-control-panel__handle"
                  style={{ cursor }}
                  x={x - Math.max(8, bounds.width * 0.006)}
                  y={y - Math.max(8, bounds.height * 0.012)}
                  width={Math.max(16, bounds.width * 0.012)}
                  height={Math.max(16, bounds.height * 0.024)}
                  aria-label={`${direction}方向へリサイズ`}
                  onPointerDown={(event) => startDrag(event, "resize", direction)}
                />
              );
            })}
          </svg>
          <div className="overlay-control-panel__help">
            <span>ドラッグ: 範囲指定 / 移動</span>
            <span>ダブルクリック: ディスプレイ全体</span>
          </div>
          <dl className="overlay-control-panel__geometry" aria-label="選択中のサイズ">
            <div>
              <dt>位置</dt>
              <dd>
                {Math.round(displayedGeometry.x)}, {Math.round(displayedGeometry.y)}
              </dd>
            </div>
            <div>
              <dt>サイズ</dt>
              <dd>
                {Math.round(displayedGeometry.width)} × {Math.round(displayedGeometry.height)}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
