import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { PresenceProvider } from "@/components/PresenceProvider";
import { siteUrl } from "@/lib/site-url";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  // Required before env(safe-area-inset-*) reports anything on iOS.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c8102e" },
    { media: "(prefers-color-scheme: dark)", color: "#17151c" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "NU Ping Pong",
  applicationName: "NU Ping Pong",
  appleWebApp: { capable: true, title: "NU Ping Pong", statusBarStyle: "default" },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  description:
    "ELO-style ranked ladder for Northeastern's ping pong club — log matches, climb the ladder, find your next opponent.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Resolves the theme before first paint so dark mode doesn't flash
            white on every cold load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${spaceGrotesk.variable} ${manrope.variable} font-sans antialiased`}>
        <PresenceProvider>{children}</PresenceProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
