import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nodus — Business payments, made clear",
  description:
    "Create itemized bills, let guests pay by QR code with supported stablecoins, and give every completed payment a clear digital receipt.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
