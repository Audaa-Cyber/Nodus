import type { Metadata } from "next";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import "./globals.css";
import "@/components/designs/merchant.css";
import "@/components/designs/payer.css";
import "@/components/designs/scroll.css";
import "@/components/designs/integration.css";

export const metadata: Metadata = {
  title: "Nodus — Business payments, made clear",
  description:
    "Create itemized bills, let guests pay by QR code with supported stablecoins, and give every completed payment a clear digital receipt.",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Root App Router layout loads the approved font weights for every route. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Cormorant+Garamond:wght@500;600;700&family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body><AuthKitProvider>{children}</AuthKitProvider></body>
    </html>
  );
}
