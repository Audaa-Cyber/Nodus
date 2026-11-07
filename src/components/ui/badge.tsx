import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "accent" | "success";
  children: React.ReactNode;
}

/**
 * Reusable Micro-Label / Status Badge matching monospace typography tokens.
 */
export function Badge({
  className,
  variant = "neutral",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    neutral: "text-[var(--crystal-silver)] border-[var(--line)]",
    accent: "text-[var(--ink)] border-[var(--ink)]",
    success: "text-[#354c3b] border-[#354c3b]",
  }[variant];

  return (
    <span
      className={cn(
        "micro-label inline-flex items-center gap-1.5 px-2 py-0.5 border rounded-sm",
        variantStyles,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

