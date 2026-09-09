import type { Metadata } from "next";
import { Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { PresenceProvider } from "@/components/PresenceProvider";

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

export const metadata: Metadata = {
  title: "NU Ping Pong",
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
      </body>
    </html>
  );
}
