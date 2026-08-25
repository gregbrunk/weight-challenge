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
    // Matches the light theme's surface, so the splash doesn't flash white
    // against a sage icon.
    background_color: "#ffffff",
    theme_color: "#4f6f52",
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
