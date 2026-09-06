import type { NextConfig } from "next";

// Nothing to configure: product images from Open Food Facts are rendered with
// plain <img> rather than next/image, so no remote host allowlist is needed.
const nextConfig: NextConfig = {};

export default nextConfig;
