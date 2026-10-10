import type { Metadata } from "next";
import { Archivo, Inter_Tight } from "next/font/google";
import "./globals.css";

import { Providers } from "@/components/providers";
import { ADMIN_THEME_SCRIPT } from "@/lib/admin-theme";

// Dashboard typography (consumed starting Step 6, scoped to
// [data-theme="arena"] in globals.css — nothing reads these yet). `axes`
// must explicitly include "wdth", or next/font only loads the default
// weight axis and the "wdth" 76 / "wdth" 125 font-variation-settings in
// globals.css silently fall back to the default width.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"),
  title: "ArenaHub",
  description: "Sports arena booking and management platform",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "ArenaHub",
    description: "Find a court. Get a game.",
    images: [{ url: "/og-share.png", width: 1200, height: 630, alt: "ArenaHub. Find a court. Get a game." }],
  },
  twitter: { card: "summary_large_image", images: ["/og-share.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* applies the admin dark theme before first paint, /admin routes only */}
        <script dangerouslySetInnerHTML={{ __html: ADMIN_THEME_SCRIPT }} />
      </head>
      <body
        className={`${archivo.variable} ${interTight.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
