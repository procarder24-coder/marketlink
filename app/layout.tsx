import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarketLink — Good finds. Good people.",
  description: "Discover thoughtful goods from Ghanaian makers and independent sellers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
