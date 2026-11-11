import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Dev server only: hostnames other than localhost (e.g. a preview domain) that may load
  // dev assets and open the HMR socket. Without this the page never hydrates there.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean),
};


export default nextConfig;
