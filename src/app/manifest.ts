import type { MetadataRoute } from "next";

/**
 * Web app manifest — what makes this installable on a home screen.
 *
 * `display: "standalone"` is the point of the whole exercise: launched from the
 * home screen the app runs without Safari's address bar and toolbar, which on a
 * phone is most of the screen back, and it stops the daily weigh-in from
 * feeling like visiting a website.
 *
 * Served from /manifest.webmanifest, which the proxy leaves public — the phone
 * fetches it before any session exists.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Weight Challenge",
    short_name: "Challenge",
    description: "Track a weight-loss plan day by day.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    // Both are the light theme's canvas, matching the <meta name="theme-color">
    // in the root layout. They drive the splash screen and the task-switcher
    // chrome, which the app itself never paints — so they are the one place a
    // palette change can be missed and only show up on a home-screen launch.
    // These were still the old sage accent after the move to Material.
    background_color: "#f7f6fd",
    theme_color: "#f7f6fd",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        // "maskable" lets Android crop to its own shape without letterboxing;
        // the mark sits inside the safe zone so nothing important is cut.
        purpose: "maskable",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
