import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ascendio — AI-powered growth on autopilot",
  description:
    "Connect your WordPress site, generate AI articles with featured images, and publish on a schedule. Fully set and forget.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body className={`${inter.className} antialiased`}>{children}</body>
    </html>
  );
}
