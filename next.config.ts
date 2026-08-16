import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the runtime image carries only what it
  // needs — no node_modules copy, no build toolchain.
  output: "standalone",
};

export default nextConfig;
