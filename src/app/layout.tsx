import type { Metadata, Viewport } from "next";
import { Jost, Overpass_Mono } from "next/font/google";
import "./globals.css";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "800"],
  display: "swap",
});

const overpassMono = Overpass_Mono({
  variable: "--font-overpass-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jost.variable} ${overpassMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
