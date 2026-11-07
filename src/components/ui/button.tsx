import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "dark" | "light" | "outline" | "link";
  children: React.ReactNode;
}

/**
 * Reusable Button component respecting the NODUS design system styles and interaction tokens.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "dark", children, ...props }, ref) => {
    const variantClass = {
      dark: "button button-dark",
      light: "button button-light",
      outline: "nav-cta",
      link: "button-link",
    }[variant];

    return (
      <button
        ref={ref}
        className={cn(variantClass, className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

