import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ad Attribution & Funnel Analytics",
  description: "Multi-touch attribution and funnel analytics for digital ad campaigns",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
