import type { NextConfig } from "next";

// Product images from Open Food Facts are rendered with plain <img> rather than
// next/image, so no remote host allowlist is needed.
const nextConfig: NextConfig = {
  // `npm run dev:tunnel` serves the dev server through a Cloudflare quick
  // tunnel, which hands out a fresh random *.trycloudflare.com hostname every
  // run. Next refuses cross-origin dev requests from unknown hosts, so the
  // whole domain has to be allowed rather than one name we can't predict.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
