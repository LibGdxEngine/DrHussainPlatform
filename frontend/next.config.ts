import type { NextConfig } from "next";

// Mirrors the headers Caddy adds in production, so a build served without the proxy has them too.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
  // Set HSTS_HEADER (for example "max-age=31536000") only where the site is served over HTTPS.
  ...(process.env.HSTS_HEADER ? [{ key: "Strict-Transport-Security", value: process.env.HSTS_HEADER }] : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev server only: hostnames other than localhost (e.g. a preview domain) that may load
  // dev assets and open the HMR socket. Without this the page never hydrates there.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};


export default nextConfig;
