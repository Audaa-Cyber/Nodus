import React from "react";
import { cn } from "@/lib/utils";

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
}

/**
 * Shell container establishing the standard max-width and horizontal gutters
 * defined by the NODUS design system.
 */
export function Container({
  children,
  className,
  as: Component = "div",
  ...props
}: ContainerProps) {
  return (
    <Component className={cn("shell", className)} {...props}>
      {children}
    </Component>
  );
}

