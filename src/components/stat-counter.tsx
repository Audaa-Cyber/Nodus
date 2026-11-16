"use client";

import { useEffect, useRef, useState } from "react";

interface StatCounterProps {
  value: number;
  className?: string;
}

export function StatCounter({ value, className = "" }: StatCounterProps) {
  const prevValue = useRef(value);
  const [isChanged, setIsChanged] = useState(false);

  useEffect(() => {
    if (prevValue.current !== value) {
      setIsChanged(true);
      const timer = window.setTimeout(() => setIsChanged(false), 550);
      prevValue.current = value;
      return () => window.clearTimeout(timer);
    }
  }, [value]);

  return (
    <strong className={`${className} nodus-stat-value ${isChanged ? "is-changed" : ""}`}>
      {value}
    </strong>
  );
}
