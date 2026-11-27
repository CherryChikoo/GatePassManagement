import type { MetadataRoute } from "next";

/**
 * Installable app (Add to Home Screen): needed for phone notifications on
 * iPhone, and gives Android a proper app icon and full-screen launch.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gate Pass — Ramachandra College of Engineering",
    short_name: "Gate Pass",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f6",
    theme_color: "#f4f4f6",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
