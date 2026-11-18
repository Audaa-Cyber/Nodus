"use client";
import type { ReactNode } from "react";
export default function InvoicePrintButton({ className = "button button-outline no-print", children }: { className?: string; children?: ReactNode }) {
  return <button type="button" className={className} onClick={() => window.print()}>{children ?? "Print / Save PDF ↗"}</button>;
}
