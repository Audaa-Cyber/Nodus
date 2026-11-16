"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { DailyReceiptPoint } from "@/lib/dashboard/daily-receipts";
import { formatUtcDate } from "@/lib/invoices";
import { useReducedDataMotion } from "@/components/use-data-motion";

interface MerchantReceiptsChartProps {
  data: DailyReceiptPoint[];
  networkLabel: string;
  isUpdated?: boolean;
}

function formatChartDate(dateStr: string) {
  try {
    const d = new Date(`${dateStr}T12:00:00Z`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return dateStr;
  }
}

/**
 * Computes a smooth cubic Bézier spline path through a sequence of 2D points.
 */
function computeSplinePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`;
  }

  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  const tension = 0.28;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

export function MerchantReceiptsChart({
  data,
  networkLabel,
  isUpdated = false,
}: MerchantReceiptsChartProps) {
  const gradientId = useId();
  const primaryStrokeId = useId();
  const secondaryStrokeId = useId();
  const glowFilterId = useId();
  const reduced = useReducedDataMotion();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const hasRenderedRef = useRef(false);

  const hasReceipts = useMemo(() => {
    return data.some((point) => point.paymentCount > 0 && BigInt(point.totalBaseUnits) > 0n);
  }, [data]);

  const chartModel = useMemo(() => {
    if (!hasReceipts || data.length === 0) return null;

    const width = 360;
    const height = 76;
    const paddingLeft = 10;
    const paddingRight = 10;
    const paddingTop = 12;
    const paddingBottom = 16;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const baseline = paddingTop + plotHeight;

    const maxBaseUnits = data.reduce(
      (max, d) => (BigInt(d.totalBaseUnits) > max ? BigInt(d.totalBaseUnits) : max),
      0n,
    );
    const maxUsdc = Number(maxBaseUnits) / 1_000_000 || 1;

    // Primary data points
    const points = data.map((point, index) => {
      const x = paddingLeft + (index / Math.max(1, data.length - 1)) * plotWidth;
      const amount = Number(BigInt(point.totalBaseUnits)) / 1_000_000;
      const y = paddingTop + (1 - amount / maxUsdc) * plotHeight;
      return {
        x,
        y,
        amount,
        point,
        index,
      };
    });

    // Secondary companion curve: smooth undulating wave creating fintech depth
    const secondaryPoints = points.map((p, i) => {
      const waveOffset = Math.sin((i / Math.max(1, points.length - 1)) * Math.PI * 3.2) * (plotHeight * 0.22);
      const blendY = paddingTop + (p.y - paddingTop) * 0.72 + waveOffset;
      const clampedY = Math.max(paddingTop + 2, Math.min(baseline - 1, blendY));
      return { x: p.x, y: clampedY };
    });

    const primarySplinePath = computeSplinePath(points);
    const secondarySplinePath = computeSplinePath(secondaryPoints);
    const areaPath = `${primarySplinePath} L ${points[points.length - 1].x.toFixed(1)},${baseline} L ${points[0].x.toFixed(1)},${baseline} Z`;

    const activePoints = points.filter((p) => p.amount > 0);
    const defaultFocalPoint = activePoints.at(-1) ?? points[points.length - 1];

    // Day tick dates along the bottom: sample 7 evenly-spaced day numbers
    const tickStep = Math.max(1, Math.floor((data.length - 1) / 6));
    const tickIndices = [0, tickStep, tickStep * 2, tickStep * 3, tickStep * 4, tickStep * 5, data.length - 1];
    const ticks = tickIndices.map((idx) => {
      const pt = data[idx];
      const dayNum = pt.date.slice(8, 10);
      return {
        index: idx,
        label: dayNum,
        fullDate: pt.date,
      };
    });

    return {
      width,
      height,
      baseline,
      points,
      activePoints,
      defaultFocalPoint,
      primarySplinePath,
      secondarySplinePath,
      areaPath,
      ticks,
      maxFormatted: maxUsdc.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      startDate: formatChartDate(data[0].date),
      endDate: "Today",
    };
  }, [data, hasReceipts]);

  const isInitialDraw = !hasRenderedRef.current && !reduced;
  if (chartModel && !hasRenderedRef.current) {
    hasRenderedRef.current = true;
  }

  if (!hasReceipts || !chartModel) {
    return (
      <div
        className="overview-chart-wrapper overview-chart-empty"
        role="region"
        aria-label={`Verified receipts chart for ${networkLabel}`}
      >
        <div className="overview-chart-header">
          <span className="overview-chart-title">Daily verified receipts · Last 30 days</span>
        </div>
        <p className="overview-chart-empty-message">No verified receipts in the last 30 days.</p>
      </div>
    );
  }

  const activeHover = hoveredIndex !== null ? chartModel.points[hoveredIndex] : null;
  const focalPoint = activeHover ?? chartModel.defaultFocalPoint;

  return (
    <div
      className="overview-chart-wrapper"
      role="region"
      aria-label={`Daily verified USDC received on ${networkLabel} over the last 30 days`}
    >
      <div className="overview-chart-header">
        <span className="overview-chart-title">Daily verified receipts · Last 30 days</span>
        {activeHover ? (
          <span className="overview-chart-tooltip" role="status">
            <strong>{activeHover.point.usdcFormatted} USDC</strong> · {formatChartDate(activeHover.point.date)} ({activeHover.point.paymentCount} {activeHover.point.paymentCount === 1 ? "payment" : "payments"})
          </span>
        ) : (
          <span className="overview-chart-peak">Peak {chartModel.maxFormatted} USDC</span>
        )}
      </div>

      <div className="overview-chart-svg-container">
        <svg
          viewBox={`0 0 ${chartModel.width} ${chartModel.height}`}
          className="overview-chart-svg"
          preserveAspectRatio="none"
          role="img"
          aria-hidden="true"
        >
          <defs>
            {/* Area fill gradient below primary spline */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
            </linearGradient>

            {/* Primary spline gradient stroke (vibrant coral to rose to violet) */}
            <linearGradient id={primaryStrokeId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="50%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#9333ea" />
            </linearGradient>

            {/* Secondary companion spline gradient stroke (soft indigo/purple) */}
            <linearGradient id={secondaryStrokeId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="60%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>

            {/* Subtle glow filter on wave line */}
            <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#f43f5e" floodOpacity="0.32" />
            </filter>
          </defs>

          {/* Minimal grid lines */}
          <line
            x1="10"
            y1={chartModel.baseline}
            x2={chartModel.width - 10}
            y2={chartModel.baseline}
            className="overview-chart-grid"
          />

          {/* Secondary companion wave */}
          <path
            d={chartModel.secondarySplinePath}
            fill="none"
            stroke={`url(#${secondaryStrokeId})`}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeOpacity="0.45"
            className={`overview-chart-secondary-line ${isInitialDraw ? "is-entering" : ""}`}
          />

          {/* Area fill below primary spline */}
          <path
            d={chartModel.areaPath}
            fill={`url(#${gradientId})`}
            className={`overview-chart-area ${isInitialDraw ? "is-entering" : ""}`}
          />

          {/* Primary smooth spline wave */}
          <path
            d={chartModel.primarySplinePath}
            fill="none"
            stroke={`url(#${primaryStrokeId})`}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${glowFilterId})`}
            className={`overview-chart-line ${isInitialDraw ? "is-entering" : ""}`}
          />

          {/* Active / Focal glowing node (matching reference image) */}
          {focalPoint && (
            <g
              className={`overview-chart-focal-node ${isUpdated ? "is-updated" : ""}`}
              transform={`translate(${focalPoint.x.toFixed(1)}, ${focalPoint.y.toFixed(1)})`}
            >
              <circle r="8.5" fill="#f43f5e" opacity="0.25" className="overview-chart-halo" />
              <circle r="4.2" stroke="#f43f5e" strokeWidth="2.2" fill="#ffffff" />
              <circle r="1.8" fill="#f43f5e" />
            </g>
          )}

          {/* Invisible hover capture zones for precise point selection */}
          {chartModel.points.map((p, idx) => (
            <rect
              key={p.point.date}
              x={p.x - 6}
              y="0"
              width="12"
              height={chartModel.height}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              onFocus={() => setHoveredIndex(idx)}
              onBlur={() => setHoveredIndex(null)}
              tabIndex={p.amount > 0 ? 0 : -1}
              aria-label={`${formatUtcDate(p.point.date)}: ${p.point.usdcFormatted} USDC`}
            />
          ))}
        </svg>
      </div>

      {/* Date ticks along the bottom matching reference image (e.g. 20, 21, 22, 23, 24...) */}
      <div className="overview-chart-dates" aria-hidden="true">
        {chartModel.ticks.map((t) => (
          <span
            key={t.fullDate}
            className={`overview-chart-tick-day ${hoveredIndex === t.index ? "is-active" : ""}`}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
