import React, { useEffect, useRef } from "react";
import type { MomentumGraphData } from "src/features/thread/domain/thread-momentum";
import { useViewSurface } from "src/view/browser/hooks/use-view-surface";
import { Spinner } from "src/view/browser/ui/Spinner";

interface MomentumLineChartProps {
  data: MomentumGraphData | null;
  loading: boolean;
}

export const MomentumLineChart: React.FC<MomentumLineChartProps> = ({ data, loading }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { window: viewWindow } = useViewSurface();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const width = 252;
    const height = 82;
    const dpr = viewWindow.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const left = 10;
    const right = width - 8;
    const top = 8;
    const bottom = height - 8;
    const chartWidth = right - left;
    const chartHeight = bottom - top;

    context.strokeStyle = "rgba(127, 127, 127, 0.25)";
    context.lineWidth = 1;
    for (let i = 0; i <= 3; i += 1) {
      const y = top + (chartHeight * i) / 3;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(right, y);
      context.stroke();
    }

    const points = data.values.map((value, index) => {
      const x = left + (chartWidth * index) / Math.max(data.values.length - 1, 1);
      const y = bottom - (value / data.maxValue) * chartHeight;
      return { x, y };
    });

    context.beginPath();
    context.moveTo(points[0]?.x ?? left, bottom);
    for (const point of points) {
      context.lineTo(point.x, point.y);
    }
    context.lineTo(points[points.length - 1]?.x ?? right, bottom);
    context.closePath();
    context.fillStyle = "rgba(56, 154, 255, 0.16)";
    context.fill();

    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
        return;
      }
      context.lineTo(point.x, point.y);
    });
    context.strokeStyle = "rgba(56, 154, 255, 0.95)";
    context.lineWidth = 1.6;
    context.stroke();

    const lastPoint = points[points.length - 1];
    if (lastPoint) {
      context.beginPath();
      context.arc(lastPoint.x, lastPoint.y, 2.2, 0, Math.PI * 2);
      context.fillStyle = "rgba(56, 154, 255, 1)";
      context.fill();
    }
  }, [data, viewWindow]);

  return (
    <div className="mini-window__momentum-chart-wrap">
      <canvas
        ref={canvasRef}
        className="mini-window__momentum-chart"
        role="img"
        aria-label="勢い推移グラフ"
      />
      {loading && (
        <p className="mini-window__note mini-window__note--loading">
          <Spinner size="xs" aria-label="勢いデータを読み込み中" />
          <span>勢いデータを読み込み中...</span>
        </p>
      )}
      {!loading && data && (
        <p className="mini-window__note">
          {/* {data.rangeLabel} / 最新: {data.latestValue.toLocaleString()} 勢い */}
          {data.rangeLabel} / 勢い
        </p>
      )}
      {!loading && !data && (
        <p className="mini-window__note">投稿時刻の情報が不足しているため描画できません</p>
      )}
    </div>
  );
};
