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
  title: "ArenaHub",
  description: "Sports arena booking and management platform",
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
