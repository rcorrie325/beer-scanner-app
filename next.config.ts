import type { NextConfig } from "next";

// Product images from Open Food Facts are rendered with plain <img> rather than
// next/image, so no remote host allowlist is needed.
const nextConfig: NextConfig = {
  // `npm run dev:tunnel` serves the dev server through a Cloudflare quick
  // tunnel, which hands out a fresh random *.trycloudflare.com hostname every
  // run. Next refuses cross-origin dev requests from unknown hosts, so the
  // whole domain has to be allowed rather than one name we can't predict.
  allowedDevOrigins: ["*.trycloudflare.com"],

  // zbar ships as WebAssembly with its own loader. Bundling it mangles that
  // loader into a `t is not a function` at call time, which the decoder used to
  // swallow as "no barcode here" — so photos silently fell back to the weaker
  // reader and rotated shots just failed. Leaving it external makes Node
  // require it whole.
  serverExternalPackages: ["@undecaf/zbar-wasm"],
};

export default nextConfig;
