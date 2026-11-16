"use client";

import { useAnimatedInteger } from "@/components/use-data-motion";

interface StatCounterProps {
  value: number;
  className?: string;
}

export function StatCounter({ value, className = "" }: StatCounterProps) {
  const { displayed, changed } = useAnimatedInteger(BigInt(value), "invoice-count", 550);

  return (
    <strong className={`${className} nodus-stat-value ${changed ? "is-changed" : ""}`} aria-label={String(value)}>
      <span aria-hidden="true">{displayed.toString()}</span>
    </strong>
  );
}
