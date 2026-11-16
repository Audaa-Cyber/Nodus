"use client";

import { useAnimatedInteger, useReducedDataMotion } from "@/components/use-data-motion";

interface MetricPercentageBadgeProps {
  percentage: number;
  label: string;
  tone?: string;
  className?: string;
}

export function MetricPercentageBadge({
  percentage,
  label,
  tone = "neutral",
  className = "",
}: MetricPercentageBadgeProps) {
  const reduced = useReducedDataMotion();
  const boundedPercentage = Math.max(0, Math.min(100, Math.round(percentage)));

  const { displayed, changed } = useAnimatedInteger(
    BigInt(boundedPercentage),
    `percentage-${label}`,
    550,
  );

  const showHighlight = !reduced && changed;

  return (
    <span
      className={`overview-metric-share overview-metric-share-${tone} ${
        showHighlight ? "is-changed" : ""
      } ${className}`.trim()}
      role="status"
      aria-label={`${label}: ${boundedPercentage}% of total`}
    >
      <span className="overview-metric-share-num" aria-hidden="true">
        {displayed.toString()}
      </span>
      <span aria-hidden="true">% of total</span>
    </span>
  );
}
