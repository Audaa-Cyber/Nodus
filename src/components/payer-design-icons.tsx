import type { SVGProps } from "react";

const paths = {
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3 7 9 6 9-6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.6-1.6 1.8-2.2 3-2.2s2.4.6 3 2.2M14.5 10h4M14.5 14h3" /></>,
  wallet: <><path d="M4 7a2 2 0 0 1 2-2h12v4M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z" /><circle cx="16.5" cy="14" r="1" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  lock: <><rect x="5" y="10" width="14" height="10" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />,
};

export function PayerIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return <svg className="i" viewBox="0 0 24 24" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
