import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ascendio — SEO Automation met AI | Meer organisch verkeer",
  description:
    "Ascendio is dé SEO automation tool voor ondernemers en bureaus. AI schrijft je artikelen, optimaliseert je content en publiceert direct op WordPress. Probeer 7 dagen gratis.",
  keywords: [
    "SEO automation",
    "SEO specialist automation",
    "AI SEO automation",
    "AI SEO tool",
    "automatisch SEO artikelen schrijven",
    "WordPress SEO automation",
    "content automation",
    "AI content marketing",
    "SEO software Nederland",
    "automatisch bloggen",
  ],
  authors: [{ name: "Ascendio" }],
  creator: "Ascendio",
  metadataBase: new URL("https://ascendio.nl"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "nl_NL",
    url: "https://ascendio.nl",
    siteName: "Ascendio",
    title: "Ascendio — SEO Automation met AI",
    description:
      "AI schrijft je SEO-artikelen en publiceert ze direct op WordPress. Minder werk, meer organisch verkeer. Probeer 7 dagen gratis.",
    images: [
      {
        url: "/landing/seo-score.png",
        width: 1200,
        height: 630,
        alt: "Ascendio SEO automation dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ascendio — SEO Automation met AI",
    description:
      "AI schrijft je SEO-artikelen en publiceert ze direct op WordPress. Probeer 7 dagen gratis.",
    images: ["/landing/seo-score.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body suppressHydrationWarning className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
