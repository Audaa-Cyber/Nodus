import type { SVGProps } from "react";

export type MerchantIconName = "print" | "copy" | "ext" | "check" | "edit" | "qrc" | "back" | "x" | "star";

export function MerchantIcon({ name, className = "i", ...props }: SVGProps<SVGSVGElement> & { name: MerchantIconName }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...props}>
    {name === "print" && <><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="6" /></>}
    {name === "copy" && <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>}
    {name === "ext" && <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />}
    {name === "check" && <path d="m5 12.5 4.5 4.5L19 7.5" />}
    {name === "edit" && <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />}
    {name === "qrc" && <><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h3v3h-3zM20 14v6h-6" /></>}
    {name === "back" && <path d="M19 12H5m6-6-6 6 6 6" />}
    {name === "x" && <path d="m6 6 12 12M18 6 6 18" />}
    {name === "star" && <path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z" />}
  </svg>;
}
