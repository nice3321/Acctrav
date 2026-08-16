import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

/** Qomra Arabic — the corporate typeface from traveliun.com.sa, self-hosted. */
const qomra = localFont({
  src: [
    { path: "../fonts/qomra-arabic-light.otf", weight: "300", style: "normal" },
    { path: "../fonts/qomra-arabic-regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/qomra-arabic-medium.otf", weight: "500", style: "normal" },
    { path: "../fonts/qomra-arabic-bold.otf", weight: "700", style: "normal" },
    { path: "../fonts/qomra-arabic-black.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-qomra",
  display: "swap",
});

/** Kept for figures: Qomra has no tabular-numeral feature, and money columns
 *  must align digit-for-digit. Plex ships proper tnum, so numbers use it. */
const plex = IBM_Plex_Sans_Arabic({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  variable: "--font-plex-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ترافليون — المنظومة المالية",
  description: "منظومة إدارة العمولات والمالية لشركة ترافليون للسفر والسياحة",
  icons: { icon: "/traveliun-bot-avatar.png", apple: "/traveliun-bot-avatar.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F7F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1614" },
  ],
};

/** Applies the saved theme before first paint so the page never flashes the wrong one. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('acctrav-theme');
if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${qomra.variable} ${plex.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
