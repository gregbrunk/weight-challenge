import type { Metadata, Viewport } from "next";
import { Inter, Roboto, Fira_Code } from "next/font/google";
import { InlineScript } from "@/components/inline-script";
import { ThemeSync } from "@/components/theme-sync";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Inter carries body and UI, Roboto the display and headline steps, Fira Code
// every figure. Only the weights the token scale actually names are loaded.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Weight Challenge",
  description: "Track a weight-loss plan day by day.",
  // Lets the app be added to the iOS home screen and run without Safari chrome.
  appleWebApp: {
    capable: true,
    title: "Challenge",
    statusBarStyle: "black-translucent",
  },
  // Phone numbers and dates in the UI are data, not links to dial or add.
  formatDetection: { telephone: false, date: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the layout paint into the notch and home-indicator areas, which the
  // --safe-* tokens then pad back out.
  viewportFit: "cover",
  // Deliberately not disabling user zoom: pinch-to-zoom is an accessibility
  // affordance, and the 16px input floor already prevents focus-zoom on iOS.
  themeColor: [
    // The canvas colour, not white — the browser chrome should meet the page
    // it sits above rather than the cards floating on it.
    { media: "(prefers-color-scheme: light)", color: "#f7f6fd" },
    { media: "(prefers-color-scheme: dark)", color: "#14121c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${roboto.variable} ${firaCode.variable} h-full`}
      // The inline script below sets data-theme before React hydrates, so the
      // DOM deliberately differs from the server's HTML here. Without this,
      // React treats it as an error and client-renders from the nearest
      // boundary — which throws the correction away.
      suppressHydrationWarning
    >
      <head>
        {/* Runs before the first paint. Without it the page renders in the
            system theme and then corrects itself, which on a phone opened in a
            dark room is the whole screen flashing white for a frame. */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
